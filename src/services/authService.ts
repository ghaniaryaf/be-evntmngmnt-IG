import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { generateReferralCode, generateCouponCode, addMonths } from '../utils/helpers';
import { RegisterRequest, LoginRequest } from '../types';
import { sendWelcomeEmail } from '../utils/email';

export class AuthService {
  // Helper untuk generate JWT
  private generateToken(payload: object): string {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('JWT_SECRET is not defined');

    // expiresIn dalam detik (7 hari default)
    const expiresIn = Number(process.env.JWT_EXPIRES_IN) || 7 * 24 * 60 * 60;

    return jwt.sign(payload, jwtSecret, { expiresIn });
  }

  async register(userData: RegisterRequest) {
    const { email, password, fullName, phoneNumber, address, referralCode } = userData;

    return prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { email } });
      if (existingUser) throw new Error('User already exists with this email');

      const hashedPassword = await bcrypt.hash(password, 12);

      // Generate unique referral code
      let referralCodeGenerated = generateReferralCode();
      while (await tx.user.findUnique({ where: { referralCode: referralCodeGenerated } })) {
        referralCodeGenerated = generateReferralCode();
      }

      // Create user
      const user = await tx.user.create({
        data: { email, password: hashedPassword, fullName, phoneNumber, address, referralCode: referralCodeGenerated },
      });

      let referralReward = null;

      // Handle referral
      if (referralCode) {
        const referrer = await tx.user.findUnique({ where: { referralCode } });
        if (referrer && referrer.id !== user.id) {
          const referral = await tx.referral.create({ data: { referrerId: referrer.id, refereeId: user.id, codeUsed: referralCode } });

          await tx.userPoint.create({
            data: { userId: referrer.id, amount: 10000, sourceType: 'REFERRAL', sourceId: referral.id, expiryDate: addMonths(new Date(), 3) },
          });

          let couponTemplate = await tx.couponTemplate.findFirst({ where: { name: 'Referral Welcome Coupon' } });
          if (!couponTemplate) {
            couponTemplate = await tx.couponTemplate.create({
              data: {
                name: 'Referral Welcome Coupon',
                description: 'Welcome coupon for referred users',
                discountType: 'PERCENTAGE',
                discountValue: 10,
                minPurchaseAmount: 100000,
                maxDiscountAmount: 50000,
              },
            });
          }

          const userCoupon = await tx.userCoupon.create({
            data: { userId: user.id, couponTemplateId: couponTemplate.id, referralId: referral.id, code: generateCouponCode(), expiryDate: addMonths(new Date(), 3) },
          });

          referralReward = { points: 10000, coupon: userCoupon };
        }
      }

      // Generate token
      const token = this.generateToken({ id: user.id, email: user.email, role: user.role });

      // Send welcome email (non-blocking)
      try {
        await sendWelcomeEmail(user.email, user.fullName);
        console.log('✅ Welcome email sent to:', user.email);
      } catch (emailError) {
        console.error('❌ Failed to send welcome email:', emailError);
        // Don't throw error, just log it
      }

      return {
        user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, referralCode: user.referralCode },
        token,
        referralReward,
      };
    });
  }

  async login(loginData: LoginRequest) {
    const { email, password } = loginData;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('Invalid email or password');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) throw new Error('Invalid email or password');

    const token = this.generateToken({ id: user.id, email: user.email, role: user.role });

    return {
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, profilePicture: user.profilePicture, referralCode: user.referralCode },
      token,
    };
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, fullName: true, role: true, profilePicture: true,
        phoneNumber: true, address: true, referralCode: true, isVerified: true,
        createdAt: true, updatedAt: true,
      },
    });
    if (!user) throw new Error('User not found');

    const points = await prisma.userPoint.aggregate({
      where: { userId, isExpired: false, expiryDate: { gte: new Date() } },
      _sum: { amount: true },
    });

    const coupons = await prisma.userCoupon.findMany({
      where: { userId, isUsed: false, expiryDate: { gte: new Date() } },
      include: { couponTemplate: true },
    });

    return { ...user, pointsBalance: points._sum.amount || 0, activeCoupons: coupons };
  }

  async updateProfile(userId: string, updateData: { fullName?: string; phoneNumber?: string; address?: string; profilePicture?: string }) {
    return prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, email: true, fullName: true, role: true, profilePicture: true, phoneNumber: true, address: true, referralCode: true, isVerified: true },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) throw new Error('Current password is incorrect');

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({ where: { id: userId }, data: { password: hashedNewPassword } });

    return { message: 'Password updated successfully' };
  }
}

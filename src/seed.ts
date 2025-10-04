import { PrismaClient, UserRole, DiscountType } from '@prisma/client';
import { hash } from 'bcryptjs';
import { addMonths } from './utils/helpers';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  try {
    // Hapus data existing (hati-hati di production!)
    if (process.env.NODE_ENV !== 'production') {
      await prisma.userCoupon.deleteMany();
      await prisma.couponTemplate.deleteMany();
      await prisma.eventVoucher.deleteMany();
      await prisma.eventTicketType.deleteMany();
      await prisma.event.deleteMany();
      await prisma.user.deleteMany();
    }

    // Create admin user
    const adminPassword = await hash('admin123', 12);
    const admin = await prisma.user.create({
      data: {
        email: 'admin@eventmanager.com',
        password: adminPassword,
        fullName: 'System Administrator',
        role: UserRole.ADMIN,
        referralCode: 'ADMIN01',
        isVerified: true,
      },
    });

    // Create sample organizer
    const organizerPassword = await hash('organizer123', 12);
    const organizer = await prisma.user.create({
      data: {
        email: 'organizer@example.com',
        password: organizerPassword,
        fullName: 'Event Organizer',
        role: UserRole.ORGANIZER,
        referralCode: 'ORG001',
        isVerified: true,
      },
    });

    // Create sample customer
    const customerPassword = await hash('customer123', 12);
    const customer = await prisma.user.create({
      data: {
        email: 'customer@example.com',
        password: customerPassword,
        fullName: 'John Customer',
        role: UserRole.CUSTOMER,
        referralCode: 'CUST01',
        isVerified: true,
      },
    });

    // Create coupon templates - PAKAI CREATE BUKAN UPSERT
    const welcomeCoupon = await prisma.couponTemplate.create({
      data: {
        name: 'Welcome Coupon',
        description: '10% discount for new users',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        minPurchaseAmount: 50000,
        maxDiscountAmount: 25000,
      },
    });

    const referralCoupon = await prisma.couponTemplate.create({
      data: {
        name: 'Referral Welcome Coupon',
        description: 'Welcome coupon for referred users',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        minPurchaseAmount: 100000,
        maxDiscountAmount: 50000,
      },
    });

    // Create sample events
    const musicEvent = await prisma.event.create({
      data: {
        organizerId: organizer.id,
        title: 'Summer Music Festival 2024',
        description: 'The biggest music festival of the year featuring top artists from around the world.',
        category: 'Music',
        location: 'Jakarta',
        address: 'GBK Senayan, Jakarta Pusat',
        startDate: new Date('2024-07-15T18:00:00Z'),
        endDate: new Date('2024-07-16T02:00:00Z'),
        availableSeats: 5000,
        basePrice: 300000,
        isPublished: true,
        ticketTypes: {
          create: [
            {
              name: 'Early Bird',
              price: 250000,
              quantity: 1000,
              description: 'Early bird special price',
            },
            {
              name: 'Regular',
              price: 300000,
              quantity: 3000,
              description: 'Standard ticket',
            },
            {
              name: 'VIP',
              price: 500000,
              quantity: 1000,
              description: 'VIP access with special benefits',
            },
          ],
        },
        vouchers: {
          create: [
            {
              code: 'SUMMER20',
              discountType: DiscountType.PERCENTAGE,
              discountValue: 20,
              maxUsage: 100,
              minPurchaseAmount: 200000,
              startDate: new Date('2024-01-01T00:00:00Z'),
              endDate: new Date('2024-07-14T23:59:59Z'),
            },
          ],
        },
      },
    });

    const techEvent = await prisma.event.create({
      data: {
        organizerId: organizer.id,
        title: 'Tech Conference 2024',
        description: 'Annual technology conference featuring industry leaders and innovators.',
        category: 'Technology',
        location: 'Bandung',
        address: 'Bandung Conference Center',
        startDate: new Date('2024-08-20T09:00:00Z'),
        endDate: new Date('2024-08-21T17:00:00Z'),
        availableSeats: 1000,
        basePrice: 500000,
        isPublished: true,
        ticketTypes: {
          create: [
            {
              name: 'Student',
              price: 250000,
              quantity: 200,
              description: 'Special price for students',
            },
            {
              name: 'Professional',
              price: 500000,
              quantity: 700,
              description: 'Standard professional ticket',
            },
            {
              name: 'VIP',
              price: 1000000,
              quantity: 100,
              description: 'VIP access with networking session',
            },
          ],
        },
      },
    });

    // Give welcome coupon to customer
    await prisma.userCoupon.create({
      data: {
        userId: customer.id,
        couponTemplateId: welcomeCoupon.id,
        code: `WELCOME-${customer.referralCode}`,
        expiryDate: addMonths(new Date(), 3),
      },
    });

    console.log('✅ Database seeded successfully');
    console.log(`👤 Admin user: ${admin.email}`);
    console.log(`🎪 Organizer user: ${organizer.email}`);
    console.log(`🎫 Customer user: ${customer.email}`);
    console.log(`🎵 Sample events created: ${musicEvent.title}, ${techEvent.title}`);
    console.log(`🎫 Coupon templates created: ${welcomeCoupon.name}, ${referralCoupon.name}`);
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
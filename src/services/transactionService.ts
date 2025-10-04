import { Prisma, TransactionStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { generateInvoiceNumber, calculateDiscount, addHours } from '../utils/helpers';
import { TransactionCreateRequest } from '../types';
import { uploadToCloudinary } from '../utils/cloudinary';
import { sendTransactionCreatedEmail, sendTransactionConfirmedEmail } from '../utils/email';

export class TransactionService {
  // ================== CREATE TRANSACTION ==================
  async createTransaction(userId: string, transactionData: TransactionCreateRequest) {
    const { eventId, ticketTypes, pointsUsed = 0, voucherCode, couponCode } = transactionData;

    return prisma.$transaction(async (tx) => {
      // Validate event
      const event = await tx.event.findFirst({
        where: { id: eventId, isPublished: true },
        include: { ticketTypes: true },
      });
      if (!event) throw new Error('Event not found or not published');

      // Validate tickets & calculate total
      let totalAmount = 0;
      const ticketUpdates: { id: string; quantity: number }[] = [];
      for (const item of ticketTypes) {
        const ticketType = event.ticketTypes.find((t) => t.id === item.ticketTypeId);
        if (!ticketType) throw new Error(`Ticket type ${item.ticketTypeId} not found`);
        if (ticketType.soldQuantity + item.quantity > ticketType.quantity)
          throw new Error(`Not enough tickets for ${ticketType.name}`);

        totalAmount += item.quantity * ticketType.price;
        ticketUpdates.push({ id: ticketType.id, quantity: item.quantity });
      }

      // Points
      let pointsDiscount = 0;
      if (pointsUsed > 0) {
        const userPoints = await tx.userPoint.aggregate({
          where: { userId, isExpired: false, expiryDate: { gte: new Date() } },
          _sum: { amount: true },
        });
        const availablePoints = userPoints._sum.amount ?? 0;
        if (pointsUsed > availablePoints) throw new Error('Insufficient points');
        pointsDiscount = Math.min(pointsUsed, totalAmount);
      }

      // Voucher
      let voucherDiscount = 0;
      let appliedVoucher = null;
      if (voucherCode) {
        const voucher = await tx.eventVoucher.findFirst({
          where: { code: voucherCode, eventId, startDate: { lte: new Date() }, endDate: { gte: new Date() } },
        });
        if (!voucher) throw new Error('Invalid or expired voucher');
        if (totalAmount < voucher.minPurchaseAmount)
          throw new Error(`Minimum purchase for voucher is ${voucher.minPurchaseAmount}`);

        voucherDiscount = calculateDiscount(totalAmount, voucher.discountType, voucher.discountValue);
        appliedVoucher = voucher;
      }

      // Coupon
      let couponDiscount = 0;
      let appliedCoupon = null;
      if (couponCode) {
        const coupon = await tx.userCoupon.findFirst({
          where: { code: couponCode, userId, isUsed: false, expiryDate: { gte: new Date() } },
          include: { couponTemplate: true },
        });
        if (!coupon) throw new Error('Invalid or expired coupon');

        const template = coupon.couponTemplate;
        if (totalAmount < template.minPurchaseAmount)
          throw new Error(`Minimum purchase for coupon is ${template.minPurchaseAmount}`);

        const maxDiscountSafe = template.maxDiscountAmount ?? undefined;
        couponDiscount = calculateDiscount(
          totalAmount,
          template.discountType,
          template.discountValue,
          maxDiscountSafe
        );
        appliedCoupon = coupon;
      }

      const finalAmount = Math.max(0, totalAmount - pointsDiscount - voucherDiscount - couponDiscount);

      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          userId,
          eventId,
          invoiceNumber: generateInvoiceNumber(),
          totalAmount,
          pointsUsed: pointsDiscount,
          voucherId: appliedVoucher?.id ?? undefined,
          voucherDiscount,
          couponId: appliedCoupon?.id ?? undefined,
          couponDiscount,
          finalAmount,
          expiryTime: addHours(new Date(), 2),
          items: {
            create: ticketTypes.map((item) => {
              const ticketType = event.ticketTypes.find((t) => t.id === item.ticketTypeId)!;
              return {
                ticketTypeId: item.ticketTypeId,
                quantity: item.quantity,
                pricePerTicket: ticketType.price,
                subtotal: item.quantity * ticketType.price,
              };
            }),
          },
        },
        include: {
          items: true,
          event: { select: { title: true, organizer: { select: { fullName: true, email: true } } } },
          user: { select: { email: true, fullName: true } }, // Include user data for email
        },
      });

      // Update tickets sold
      for (const update of ticketUpdates) {
        await tx.eventTicketType.update({ where: { id: update.id }, data: { soldQuantity: { increment: update.quantity } } });
      }

      // Update booked seats
      const totalTickets = ticketTypes.reduce((sum, item) => sum + item.quantity, 0);
      await tx.event.update({ where: { id: eventId }, data: { bookedSeats: { increment: totalTickets } } });

      // Mark coupon as used
      if (appliedCoupon) await tx.userCoupon.update({ where: { id: appliedCoupon.id }, data: { isUsed: true } });

      // Update voucher usage
      if (appliedVoucher) await tx.eventVoucher.update({ where: { id: appliedVoucher.id }, data: { usedCount: { increment: 1 } } });

      // Deduct points
      if (pointsUsed > 0) await this.deductPoints(tx, userId, pointsDiscount);

      // Send transaction created email (non-blocking)
      try {
        await sendTransactionCreatedEmail(transaction.user.email, transaction);
        console.log('Transaction email sent to:', transaction.user.email);
      } catch (emailError) {
        console.error('Failed to send transaction email:', emailError);
        // Don't throw error, just log it
      }

      return transaction;
    });
  }

  // ================== DEDUCT POINTS ==================
  private async deductPoints(prisma: Prisma.TransactionClient, userId: string, amount: number) {
    const points = await prisma.userPoint.findMany({
      where: { userId, isExpired: false, expiryDate: { gte: new Date() } },
      orderBy: { expiryDate: 'asc' },
    });

    let remainingAmount = amount;
    for (const point of points) {
      if (remainingAmount <= 0) break;
      const deductAmount = Math.min(remainingAmount, point.amount);
      await prisma.userPoint.update({ where: { id: point.id }, data: { amount: { decrement: deductAmount } } });
      remainingAmount -= deductAmount;
    }
  }

  // ================== CONFIRM TRANSACTION ==================
  async confirmTransaction(transactionId: string, organizerId: string, isAccepted: boolean) {
    return prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { id: transactionId, event: { organizerId }, status: 'WAITING_FOR_CONFIRMATION' },
        include: { 
          event: true, 
          user: { select: { email: true, fullName: true } } // Include user data
        },
      });
      if (!transaction) throw new Error('Transaction not found or invalid status');

      const newStatus = isAccepted ? 'DONE' : 'REJECTED';

      if (isAccepted) {
        const totalTickets = await tx.transactionItem.aggregate({ where: { transactionId }, _sum: { quantity: true } });
        const ticketCount = totalTickets._sum.quantity ?? 0;

        await tx.eventAttendee.create({
          data: {
            eventId: transaction.eventId,
            userId: transaction.userId,
            transactionId,
            ticketCount,
            totalPaid: transaction.finalAmount,
          },
        });
      } else {
        await this.rollbackTransaction(tx, transactionId);
      }

      const updatedTransaction = await tx.transaction.update({ 
        where: { id: transactionId }, 
        data: { status: newStatus },
        include: {
          event: { select: { title: true } },
          user: { select: { email: true, fullName: true } }
        }
      });

      // Send transaction confirmation email (non-blocking)
      try {
        await sendTransactionConfirmedEmail(updatedTransaction.user.email, updatedTransaction, isAccepted);
        console.log('Transaction confirmation email sent to:', updatedTransaction.user.email);
      } catch (emailError) {
        console.error('Failed to send transaction confirmation email:', emailError);
        // Don't throw error, just log it
      }

      return updatedTransaction;
    });
  }

  // ================== ROLLBACK ==================
  private async rollbackTransaction(prisma: Prisma.TransactionClient, transactionId: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { items: true, voucher: true, coupon: true },
    });
    if (!transaction) return;

    for (const item of transaction.items) {
      await prisma.eventTicketType.update({ where: { id: item.ticketTypeId }, data: { soldQuantity: { decrement: item.quantity } } });
    }

    const totalTickets = transaction.items.reduce((sum, item) => sum + item.quantity, 0);
    await prisma.event.update({ where: { id: transaction.eventId }, data: { bookedSeats: { decrement: totalTickets } } });

    if (transaction.voucherId) await prisma.eventVoucher.update({ where: { id: transaction.voucherId }, data: { usedCount: { decrement: 1 } } });
    if (transaction.couponId) await prisma.userCoupon.update({ where: { id: transaction.couponId }, data: { isUsed: false } });
    if (transaction.pointsUsed > 0) await this.restorePoints(prisma, transaction.userId, transaction.pointsUsed);
  }

  // ================== RESTORE POINTS ==================
  private async restorePoints(prisma: Prisma.TransactionClient, userId: string, amount: number) {
    const latestPoint = await prisma.userPoint.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    if (latestPoint) {
      await prisma.userPoint.update({ where: { id: latestPoint.id }, data: { amount: { increment: amount } } });
    } else {
      await prisma.userPoint.create({ data: { userId, amount, sourceType: 'REFUND', expiryDate: addMonths(new Date(), 3) } });
    }
  }

 // ================== EXPIRE TRANSACTION ==================
  private async expireTransaction(prisma: Prisma.TransactionClient, transactionId: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        items: true,
        voucher: true,
        coupon: true,
      },
    });

    if (!transaction || transaction.status !== 'WAITING_FOR_PAYMENT') {
      return;
    }

    // Update status to expired
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: 'EXPIRED' },
    });

    // Rollback the transaction
    await this.rollbackTransaction(prisma, transactionId);
  }

  // ================== UPLOAD PAYMENT PROOF ==================
  async uploadPaymentProof(transactionId: string, userId: string, file: Express.Multer.File) {
    return prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: {
          id: transactionId,
          userId,
          status: 'WAITING_FOR_PAYMENT',
        },
      });

      if (!transaction) {
        throw new Error('Transaction not found or invalid status');
      }

      if (new Date() > transaction.expiryTime) {
        await this.expireTransaction(tx, transactionId);
        throw new Error('Transaction has expired');
      }

      // Upload ke Cloudinary
      const paymentProofUrl = await uploadToCloudinary(file);

      const payment = await tx.transactionPayment.upsert({
        where: { transactionId },
        update: {
          paymentProofUrl,
          updatedAt: new Date(),
        },
        create: {
          transactionId,
          paymentProofUrl,
        },
      });

      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'WAITING_FOR_CONFIRMATION',
        },
      });

      return payment;
    });
  }

  // ================== GET USER TRANSACTIONS ==================
  async getUserTransactions(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId },
        include: {
          event: { select: { title: true, imageUrl: true, startDate: true, location: true } },
          payment: true,
          items: { include: { ticketType: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where: { userId } }),
    ]);

    return { transactions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // ================== GET EVENT TRANSACTIONS ==================
  async getEventTransactions(eventId: string, organizerId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { eventId, event: { organizerId } },
        include: {
          user: { select: { id: true, fullName: true, email: true, profilePicture: true } },
          payment: true,
          items: { include: { ticketType: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where: { eventId, event: { organizerId } } }),
    ]);

    return { transactions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}

// ================== ADD MONTHS HELPER ==================
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

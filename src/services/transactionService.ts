import { Prisma, TransactionStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { generateInvoiceNumber, calculateDiscount, addHours, addMonths } from '../utils/helpers';
import { TransactionCreateRequest } from '../types';
import { uploadToCloudinary } from '../utils/cloudinary';
import { sendTransactionCreatedEmail, sendTransactionConfirmedEmail } from '../utils/email';

// Custom error classes for better error handling
class TransactionError extends Error {
  constructor(message: string, public code: string = 'TRANSACTION_ERROR') {
    super(message);
    this.name = 'TransactionError';
  }
}

class InsufficientTicketsError extends TransactionError {
  constructor(ticketType: string, available: number, requested: number) {
    super(`Not enough tickets for ${ticketType}. Available: ${available}, Requested: ${requested}`, 'INSUFFICIENT_TICKETS');
  }
}

class EventNotAvailableError extends TransactionError {
  constructor(message: string = 'Event not available for booking') {
    super(message, 'EVENT_NOT_AVAILABLE');
  }
}

class VoucherError extends TransactionError {
  constructor(message: string) {
    super(message, 'VOUCHER_ERROR');
  }
}

class PointsError extends TransactionError {
  constructor(message: string) {
    super(message, 'POINTS_ERROR');
  }
}

export class TransactionService {
  // ================== CREATE TRANSACTION (FIXED) ==================
  async createTransaction(userId: string, transactionData: TransactionCreateRequest) {
    const { eventId, ticketTypes, pointsUsed = 0, voucherCode, couponCode } = transactionData;

    // Validate input
    if (!ticketTypes || ticketTypes.length === 0) {
      throw new TransactionError('At least one ticket type is required', 'INVALID_INPUT');
    }

    return await prisma.$transaction(async (tx) => {
      // ========== STEP 1: LOCK EVENT AND TICKETS ==========
      const event = await tx.event.findFirst({
        where: { 
          id: eventId, 
          isPublished: true,
          startDate: { gt: new Date() } // Event hasn't started yet
        },
        include: { 
          ticketTypes: {
            where: {
              id: { in: ticketTypes.map(t => t.ticketTypeId) }
            }
          }
        }
      });
      
      if (!event) {
        throw new EventNotAvailableError('Event not found, not published, or has already started');
      }

      // Validate we found all requested ticket types
      const foundTicketTypeIds = event.ticketTypes.map(t => t.id);
      const requestedTicketTypeIds = ticketTypes.map(t => t.ticketTypeId);
      const missingTicketTypes = requestedTicketTypeIds.filter(id => !foundTicketTypeIds.includes(id));
      
      if (missingTicketTypes.length > 0) {
        throw new TransactionError(`Ticket types not found: ${missingTicketTypes.join(', ')}`, 'TICKET_TYPES_NOT_FOUND');
      }

      // ========== STEP 2: VALIDATE TICKET AVAILABILITY ==========
      let totalAmount = 0;
      const ticketUpdates: { 
        id: string; 
        quantity: number; 
        currentSold: number; 
        maxQuantity: number;
        name: string;
        price: number;
      }[] = [];
      
      for (const item of ticketTypes) {
        const ticketType = event.ticketTypes.find((t) => t.id === item.ticketTypeId);
        if (!ticketType) continue;

        // Validate quantity
        if (item.quantity <= 0) {
          throw new TransactionError(`Invalid quantity for ${ticketType.name}`, 'INVALID_QUANTITY');
        }

        // Check availability with current data
        const availableTickets = ticketType.quantity - ticketType.soldQuantity;
        if (item.quantity > availableTickets) {
          throw new InsufficientTicketsError(ticketType.name, availableTickets, item.quantity);
        }

        totalAmount += item.quantity * ticketType.price;
        ticketUpdates.push({ 
          id: ticketType.id, 
          quantity: item.quantity,
          currentSold: ticketType.soldQuantity,
          maxQuantity: ticketType.quantity,
          name: ticketType.name,
          price: ticketType.price
        });
      }

      // ========== STEP 3: VALIDATE EVENT CAPACITY ==========
      const totalTicketsRequested = ticketTypes.reduce((sum, item) => sum + item.quantity, 0);
      const availableEventSeats = event.availableSeats - event.bookedSeats;
      if (totalTicketsRequested > availableEventSeats) {
        throw new TransactionError(
          `Not enough seats available. Available: ${availableEventSeats}, Requested: ${totalTicketsRequested}`,
          'INSUFFICIENT_SEATS'
        );
      }

      // ========== STEP 4: VALIDATE POINTS ==========
      let pointsDiscount = 0;
      if (pointsUsed > 0) {
        if (pointsUsed > totalAmount) {
          throw new PointsError('Points used cannot exceed total amount');
        }

        const userPoints = await tx.userPoint.aggregate({
          where: { 
            userId, 
            isExpired: false, 
            expiryDate: { gte: new Date() } 
          },
          _sum: { amount: true },
        });
        
        const availablePoints = userPoints._sum.amount ?? 0;
        if (pointsUsed > availablePoints) {
          throw new PointsError(`Insufficient points. Available: ${availablePoints}, Requested: ${pointsUsed}`);
        }
        
        pointsDiscount = pointsUsed;
      }

      // ========== STEP 5: VALIDATE VOUCHER (FIXED - NO ERROR IF NOT FOUND) ==========
      let voucherDiscount = 0;
      let appliedVoucher = null;
      if (voucherCode && voucherCode.trim() !== '') {
        const voucher = await tx.eventVoucher.findFirst({
          where: { 
            code: voucherCode.trim(), 
            eventId, 
            startDate: { lte: new Date() }, 
            endDate: { gte: new Date() } 
          },
        });
        
        if (voucher) {
          // Only validate if voucher exists and is valid
          if (voucher.usedCount >= voucher.maxUsage) {
            throw new VoucherError('Voucher usage limit reached');
          }
          
          if (totalAmount < voucher.minPurchaseAmount) {
            throw new VoucherError(`Minimum purchase for voucher is ${voucher.minPurchaseAmount}`);
          }

          voucherDiscount = calculateDiscount(totalAmount, voucher.discountType, voucher.discountValue);
          appliedVoucher = voucher;
        }
        // If voucher code doesn't exist or is expired, just proceed without voucher
      }

      // ========== STEP 6: VALIDATE COUPON (FIXED - NO ERROR IF NOT FOUND) ==========
      let couponDiscount = 0;
      let appliedCoupon = null;
      if (couponCode && couponCode.trim() !== '') {
        const coupon = await tx.userCoupon.findFirst({
          where: { 
            code: couponCode.trim(), 
            userId, 
            isUsed: false, 
            expiryDate: { gte: new Date() } 
          },
          include: { couponTemplate: true },
        });
        
        if (coupon) {
          // Only validate if coupon exists and is valid
          const template = coupon.couponTemplate;
          if (totalAmount < template.minPurchaseAmount) {
            throw new TransactionError(
              `Minimum purchase for coupon is ${template.minPurchaseAmount}`,
              'COUPON_MINIMUM_NOT_MET'
            );
          }

          const maxDiscountSafe = template.maxDiscountAmount ?? undefined;
          couponDiscount = calculateDiscount(
            totalAmount,
            template.discountType,
            template.discountValue,
            maxDiscountSafe
          );
          appliedCoupon = coupon;
        }
        // If coupon code doesn't exist or is invalid, just proceed without coupon
      }

      // ========== STEP 7: CALCULATE FINAL AMOUNT ==========
      const finalAmount = Math.max(0, totalAmount - pointsDiscount - voucherDiscount - couponDiscount);

      // ========== STEP 8: CREATE TRANSACTION ==========
      const transaction = await tx.transaction.create({
        data: {
          userId,
          eventId,
          invoiceNumber: generateInvoiceNumber(),
          status: 'WAITING_FOR_PAYMENT',
          totalAmount,
          pointsUsed: pointsDiscount,
          voucherId: appliedVoucher?.id ?? null,
          voucherDiscount,
          couponId: appliedCoupon?.id ?? null,
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
          items: {
            include: {
              ticketType: {
                select: { name: true }
              }
            }
          },
          event: { 
            select: { 
              title: true, 
              organizer: { 
                select: { fullName: true, email: true } 
              } 
            } 
          },
          user: { select: { email: true, fullName: true } },
        },
      });

      // ========== STEP 9: UPDATE TICKET COUNTS ==========
      for (const update of ticketUpdates) {
        const updated = await tx.eventTicketType.update({
          where: { id: update.id },
          data: { 
            soldQuantity: { increment: update.quantity },
            updatedAt: new Date()
          }
        });

        // Double-check the update was successful and valid
        if (updated.soldQuantity > update.maxQuantity) {
          throw new Error(`Ticket quantity exceeded for ${update.name}`);
        }
      }

      // ========== STEP 10: UPDATE EVENT BOOKED SEATS ==========
      await tx.event.update({
        where: { id: eventId },
        data: { 
          bookedSeats: { increment: totalTicketsRequested },
          updatedAt: new Date()
        }
      });

      // ========== STEP 11: UPDATE VOUCHER USAGE ==========
      if (appliedVoucher) {
        await tx.eventVoucher.update({
          where: { id: appliedVoucher.id },
          data: { usedCount: { increment: 1 } }
        });
      }

      // ========== STEP 12: MARK COUPON AS USED ==========
      if (appliedCoupon) {
        await tx.userCoupon.update({ 
          where: { id: appliedCoupon.id }, 
          data: { isUsed: true } 
        });
      }

      // ========== STEP 13: DEDUCT POINTS ==========
      if (pointsUsed > 0) {
        await this.deductPoints(tx, userId, pointsDiscount);
      }

      // ========== STEP 14: SEND CONFIRMATION EMAIL ==========
      try {
        await sendTransactionCreatedEmail(transaction.user.email, transaction);
        console.log('Transaction email sent to:', transaction.user.email);
      } catch (emailError) {
        console.error('Failed to send transaction email:', emailError);
      }

      return transaction;
    });
  }

  // ================== DEDUCT POINTS ==================
  private async deductPoints(prisma: Prisma.TransactionClient, userId: string, amount: number) {
    if (amount <= 0) return;

    const points = await prisma.userPoint.findMany({
      where: { 
        userId, 
        isExpired: false, 
        expiryDate: { gte: new Date() },
        amount: { gt: 0 }
      },
      orderBy: { expiryDate: 'asc' },
    });

    let remainingAmount = amount;
    for (const point of points) {
      if (remainingAmount <= 0) break;
      
      const deductAmount = Math.min(remainingAmount, point.amount);
      remainingAmount -= deductAmount;

      await prisma.userPoint.update({
        where: { id: point.id },
        data: { amount: { decrement: deductAmount } }
      });
    }

    if (remainingAmount > 0) {
      throw new PointsError(`Failed to deduct all points. Remaining: ${remainingAmount}`);
    }
  }

  // ================== CONFIRM TRANSACTION ==================
  async confirmTransaction(transactionId: string, organizerId: string, isAccepted: boolean) {
    return await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { 
          id: transactionId, 
          event: { organizerId }, 
          status: 'WAITING_FOR_CONFIRMATION' 
        },
        include: { 
          event: true, 
          user: { select: { email: true, fullName: true } },
          items: true
        },
      });
      
      if (!transaction) {
        throw new TransactionError('Transaction not found or invalid status', 'TRANSACTION_NOT_FOUND');
      }

      const newStatus = isAccepted ? 'DONE' : 'REJECTED';

      if (isAccepted) {
        const totalTickets = transaction.items.reduce((sum, item) => sum + item.quantity, 0);

        await tx.eventAttendee.create({
          data: {
            eventId: transaction.eventId,
            userId: transaction.userId,
            transactionId,
            ticketCount: totalTickets,
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

      try {
        await sendTransactionConfirmedEmail(updatedTransaction.user.email, updatedTransaction, isAccepted);
        console.log('Transaction confirmation email sent to:', updatedTransaction.user.email);
      } catch (emailError) {
        console.error('Failed to send transaction confirmation email:', emailError);
      }

      return updatedTransaction;
    });
  }

  // ================== ROLLBACK TRANSACTION ==================
  private async rollbackTransaction(prisma: Prisma.TransactionClient, transactionId: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { 
        items: true, 
        voucher: true, 
        coupon: true 
      },
    });
    
    if (!transaction) return;

    // Rollback ticket counts
    for (const item of transaction.items) {
      await prisma.eventTicketType.update({
        where: { id: item.ticketTypeId },
        data: { 
          soldQuantity: { decrement: item.quantity },
          updatedAt: new Date()
        }
      });
    }

    // Rollback event booked seats
    const totalTickets = transaction.items.reduce((sum, item) => sum + item.quantity, 0);
    await prisma.event.update({
      where: { id: transaction.eventId },
      data: { 
        bookedSeats: { decrement: totalTickets },
        updatedAt: new Date()
      }
    });

    // Rollback voucher usage
    if (transaction.voucherId) {
      await prisma.eventVoucher.update({
        where: { id: transaction.voucherId },
        data: { 
          usedCount: { decrement: 1 },
          updatedAt: new Date()
        }
      });
    }

    // Rollback coupon usage
    if (transaction.couponId) {
      await prisma.userCoupon.update({
        where: { id: transaction.couponId },
        data: { 
          isUsed: false
        }
      });
    }

    // Restore points
    if (transaction.pointsUsed > 0) {
      await this.restorePoints(prisma, transaction.userId, transaction.pointsUsed);
    }
  }

  // ================== RESTORE POINTS ==================
  private async restorePoints(prisma: Prisma.TransactionClient, userId: string, amount: number) {
    if (amount <= 0) return;

    const existingPoint = await prisma.userPoint.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPoint) {
      await prisma.userPoint.update({
        where: { id: existingPoint.id },
        data: { amount: { increment: amount } }
      });
    } else {
      await prisma.userPoint.create({
        data: {
          userId,
          amount,
          sourceType: 'REFUND',
          expiryDate: addMonths(new Date(), 3),
        }
      });
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

    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: 'EXPIRED' },
    });

    await this.rollbackTransaction(prisma, transactionId);
  }

  // ================== UPLOAD PAYMENT PROOF ==================
  async uploadPaymentProof(transactionId: string, userId: string, file: Express.Multer.File) {
    return await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: {
          id: transactionId,
          userId,
          status: 'WAITING_FOR_PAYMENT',
        },
      });

      if (!transaction) {
        throw new TransactionError('Transaction not found or invalid status', 'TRANSACTION_NOT_FOUND');
      }

      if (new Date() > transaction.expiryTime) {
        await this.expireTransaction(tx, transactionId);
        throw new TransactionError('Transaction has expired', 'TRANSACTION_EXPIRED');
      }

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
          event: { 
            select: { 
              title: true, 
              imageUrl: true, 
              startDate: true, 
              location: true 
            } 
          },
          payment: true,
          items: { 
            include: { 
              ticketType: { 
                select: { 
                  name: true 
                } 
              } 
            } 
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where: { userId } }),
    ]);

    return { 
      transactions, 
      pagination: { 
        page, 
        limit, 
        total, 
        totalPages: Math.ceil(total / limit) 
      } 
    };
  }

  // ================== GET EVENT TRANSACTIONS ==================
  async getEventTransactions(eventId: string, organizerId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { 
          eventId, 
          event: { organizerId } 
        },
        include: {
          user: { 
            select: { 
              id: true, 
              fullName: true, 
              email: true, 
              profilePicture: true 
            } 
          },
          payment: true,
          items: { 
            include: { 
              ticketType: { 
                select: { 
                  name: true 
                } 
              } 
            } 
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ 
        where: { 
          eventId, 
          event: { organizerId } 
        } 
      }),
    ]);

    return { 
      transactions, 
      pagination: { 
        page, 
        limit, 
        total, 
        totalPages: Math.ceil(total / limit) 
      } 
    };
  }

  // ================== GET TRANSACTION BY ID ==================
  async getTransactionById(transactionId: string, userId?: string) {
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: transactionId,
        ...(userId ? { userId } : {})
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true,
            location: true,
            address: true,
            organizer: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            }
          }
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        },
        payment: true,
        items: {
          include: {
            ticketType: {
              select: {
                id: true,
                name: true,
                price: true
              }
            }
          }
        },
        voucher: {
          select: {
            code: true,
            discountType: true,
            discountValue: true
          }
        }
      }
    });

    if (!transaction) {
      throw new TransactionError('Transaction not found', 'TRANSACTION_NOT_FOUND');
    }

    return transaction;
  }
}
import { Prisma, DiscountType } from '@prisma/client';
import { prisma } from '../utils/prisma';

export interface VoucherCreateRequest {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUsage: number;
  minPurchaseAmount?: number;
  startDate: Date;
  endDate: Date;
}

export class VoucherService {
  async createVoucher(eventId: string, organizerId: string, voucherData: VoucherCreateRequest) {
    return prisma.$transaction(async (tx) => {
      // Verify event belongs to organizer
      const event = await tx.event.findFirst({
        where: {
          id: eventId,
          organizerId,
        },
      });

      if (!event) {
        throw new Error('Event not found or access denied');
      }

      // Check if voucher code already exists
      const existingVoucher = await tx.eventVoucher.findFirst({
        where: {
          code: voucherData.code,
        },
      });

      if (existingVoucher) {
        throw new Error('Voucher code already exists');
      }

      // Create voucher
      const voucher = await tx.eventVoucher.create({
        data: {
          eventId,
          code: voucherData.code,
          discountType: voucherData.discountType,
          discountValue: voucherData.discountValue,
          maxUsage: voucherData.maxUsage,
          minPurchaseAmount: voucherData.minPurchaseAmount || 0,
          startDate: voucherData.startDate,
          endDate: voucherData.endDate,
        },
      });

      return voucher;
    });
  }

  async getEventVouchers(eventId: string, organizerId: string) {
    // Verify event belongs to organizer
    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        organizerId,
      },
    });

    if (!event) {
      throw new Error('Event not found or access denied');
    }

    const vouchers = await prisma.eventVoucher.findMany({
      where: {
        eventId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return vouchers;
  }

  async getActiveVouchers(eventId: string) {
    const now = new Date();
    
    const vouchers = await prisma.eventVoucher.findMany({
      where: {
        eventId,
        startDate: { lte: now },
        endDate: { gte: now },
        usedCount: { lt: prisma.eventVoucher.fields.maxUsage },
      },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        maxUsage: true,
        usedCount: true,
        minPurchaseAmount: true,
        startDate: true,
        endDate: true,
      },
    });

    return vouchers;
  }

  async updateVoucher(voucherId: string, organizerId: string, updateData: Partial<VoucherCreateRequest>) {
    return prisma.$transaction(async (tx) => {
      const voucher = await tx.eventVoucher.findFirst({
        where: {
          id: voucherId,
          event: {
            organizerId,
          },
        },
        include: {
          event: true,
        },
      });

      if (!voucher) {
        throw new Error('Voucher not found or access denied');
      }

      // If updating code, check for duplicates
      if (updateData.code && updateData.code !== voucher.code) {
        const existingVoucher = await tx.eventVoucher.findFirst({
          where: {
            code: updateData.code,
            id: { not: voucherId },
          },
        });

        if (existingVoucher) {
          throw new Error('Voucher code already exists');
        }
      }

      const updatedVoucher = await tx.eventVoucher.update({
        where: { id: voucherId },
        data: updateData,
      });

      return updatedVoucher;
    });
  }

  async deleteVoucher(voucherId: string, organizerId: string) {
    const voucher = await prisma.eventVoucher.findFirst({
      where: {
        id: voucherId,
        event: {
          organizerId,
        },
      },
    });

    if (!voucher) {
      throw new Error('Voucher not found or access denied');
    }

    await prisma.eventVoucher.delete({
      where: { id: voucherId },
    });

    return { message: 'Voucher deleted successfully' };
  }

  async validateVoucher(code: string, eventId: string, totalAmount: number) {
    const now = new Date();
    
    const voucher = await prisma.eventVoucher.findFirst({
      where: {
        code,
        eventId,
        startDate: { lte: now },
        endDate: { gte: now },
        usedCount: { lt: prisma.eventVoucher.fields.maxUsage },
      },
    });

    if (!voucher) {
      throw new Error('Invalid or expired voucher');
    }

    if (totalAmount < voucher.minPurchaseAmount) {
      throw new Error(`Minimum purchase amount for this voucher is ${voucher.minPurchaseAmount}`);
    }

    return voucher;
  }
}
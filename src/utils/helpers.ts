import { v4 as uuidv4 } from 'uuid';

export const generateInvoiceNumber = (): string => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV-${timestamp}-${random}`;
};

export const generateReferralCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export const generateCouponCode = (): string => {
  return `CPN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
};

export const calculateDiscount = (
  amount: number,
  discountType: 'PERCENTAGE' | 'FIXED',
  discountValue: number,
  maxDiscount?: number
): number => {
  let discount = 0;
  
  if (discountType === 'PERCENTAGE') {
    discount = (amount * discountValue) / 100;
    if (maxDiscount && discount > maxDiscount) {
      discount = maxDiscount;
    }
  } else {
    discount = discountValue;
  }
  
  return Math.min(discount, amount);
};

export const isDateInFuture = (date: Date): boolean => {
  return new Date(date) > new Date();
};

export const isDateInPast = (date: Date): boolean => {
  return new Date(date) < new Date();
};

export const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

export const addHours = (date: Date, hours: number): Date => {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};
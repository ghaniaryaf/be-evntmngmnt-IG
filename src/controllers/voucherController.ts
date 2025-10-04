import { Response } from 'express';
import { AuthRequest } from '../types';
import { VoucherService, VoucherCreateRequest } from '../services/voucherService';
import { handleValidationErrors } from '../middleware/validation';

const voucherService = new VoucherService();

export const createVoucher = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { eventId } = req.params;
    const voucherData: VoucherCreateRequest = req.body;

    const voucher = await voucherService.createVoucher(eventId, req.user.id, voucherData);

    res.status(201).json({
      success: true,
      message: 'Voucher created successfully',
      data: voucher,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getEventVouchers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { eventId } = req.params;

    const vouchers = await voucherService.getEventVouchers(eventId, req.user.id);

    res.status(200).json({
      success: true,
      message: 'Event vouchers retrieved successfully',
      data: vouchers,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getActiveVouchers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;

    const vouchers = await voucherService.getActiveVouchers(eventId);

    res.status(200).json({
      success: true,
      message: 'Active vouchers retrieved successfully',
      data: vouchers,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateVoucher = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { voucherId } = req.params;
    const updateData: Partial<VoucherCreateRequest> = req.body;

    console.log('Updating voucher:', voucherId, 'with data:', updateData);

    const voucher = await voucherService.updateVoucher(voucherId, req.user.id, updateData);

    res.status(200).json({
      success: true,
      message: 'Voucher updated successfully',
      data: voucher,
    });
  } catch (error: any) {
    console.error('Update voucher error:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteVoucher = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { voucherId } = req.params;

    const result = await voucherService.deleteVoucher(voucherId, req.user.id);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
import { Response } from 'express';
import { AuthRequest } from '../types';
import { AuthService } from '../services/authService';
import { handleValidationErrors } from '../middleware/validation';

const authService = new AuthService();

export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    handleValidationErrors(req, res, () => {});

    const result = await authService.register(req.body);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    handleValidationErrors(req, res, () => {});

    const result = await authService.login(req.body);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error: any) {
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const profile = await authService.getProfile(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      data: profile,
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const profile = await authService.updateProfile(req.user.id, req.body);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: profile,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    await authService.changePassword(req.user.id, currentPassword, newPassword);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
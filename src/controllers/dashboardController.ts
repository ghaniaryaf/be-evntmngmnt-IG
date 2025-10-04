import { Response } from 'express';
import { AuthRequest } from '../types';
import { DashboardService } from '../services/dashboardService';

const dashboardService = new DashboardService();

export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const stats = await dashboardService.getOrganizerStats(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Dashboard stats retrieved successfully',
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getDashboardAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;

    const analytics = await dashboardService.getOrganizerAnalytics(req.user.id, year, month);

    res.status(200).json({
      success: true,
      message: 'Dashboard analytics retrieved successfully',
      data: analytics,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
import { Router } from 'express';
import {
  getDashboardStats,
  getDashboardAnalytics,
} from '../controllers/dashboardController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Protected routes
router.use(authenticate);

// Organizer routes
router.get('/stats', authorize('ORGANIZER'), getDashboardStats);
router.get('/analytics', authorize('ORGANIZER'), getDashboardAnalytics);

export default router;
import { Router } from 'express';
import {
  createVoucher,
  getEventVouchers,
  getActiveVouchers,
  updateVoucher,
  deleteVoucher,
} from '../controllers/voucherController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public routes - get active vouchers for an event
router.get('/event/:eventId/active', getActiveVouchers);

// Protected routes
router.use(authenticate);

// Organizer routes
router.post('/event/:eventId', authorize('ORGANIZER'), createVoucher);
router.get('/event/:eventId', authorize('ORGANIZER'), getEventVouchers);
router.put('/:voucherId/update', authorize('ORGANIZER'), updateVoucher);
router.delete('/:voucherId/delete', authorize('ORGANIZER'), deleteVoucher);

export default router;
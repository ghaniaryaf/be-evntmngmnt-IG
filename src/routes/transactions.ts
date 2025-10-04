import { Router } from 'express';
import {
  createTransaction,
  uploadPaymentProof,
  confirmTransaction,
  getUserTransactions,
  getEventTransactions,
} from '../controllers/transactionController';
import {
  validateTransactionCreate,
  handleValidationErrors,
} from '../middleware/validation';
import { authenticate, authorize } from '../middleware/auth';
import { uploadPaymentProof as uploadMiddleware } from '../middleware/upload';

const router = Router();

router.use(authenticate);

// Customer routes
router.post(
  '/',
  authorize('CUSTOMER'),
  validateTransactionCreate,
  handleValidationErrors,
  createTransaction
);
router.post(
  '/:transactionId/payment-proof',
  authorize('CUSTOMER'),
  uploadMiddleware,
  uploadPaymentProof
);
router.get('/user/my-transactions', authorize('CUSTOMER'), getUserTransactions);

// Organizer routes
router.post(
  '/:transactionId/confirm',
  authorize('ORGANIZER'),
  confirmTransaction
);
router.get(
  '/event/:eventId',
  authorize('ORGANIZER'),
  getEventTransactions
);

export default router;
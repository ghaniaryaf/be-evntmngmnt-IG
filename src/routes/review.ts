import { Router } from 'express';
import {
  createReview,
  getEventReviews,
  getUserReviews,
  updateReview,
  deleteReview,
} from '../controllers/reviewController';
import { validateReviewCreate, handleValidationErrors } from '../middleware/validation';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/event/:eventId', getEventReviews);

// Protected routes
router.use(authenticate);

// Customer routes
router.post(
  '/event/:eventId',
  authorize('CUSTOMER'),
  validateReviewCreate,
  handleValidationErrors,
  createReview
);

router.get('/user/my-reviews', authorize('CUSTOMER'), getUserReviews);
router.put('/:reviewId', authorize('CUSTOMER'), validateReviewCreate, handleValidationErrors, updateReview);
router.delete('/:reviewId', authorize('CUSTOMER'), deleteReview);

export default router;
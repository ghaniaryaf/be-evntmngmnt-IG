import { Response } from 'express';
import { AuthRequest } from '../types';
import { ReviewService } from '../services/reviewService';
import { handleValidationErrors, validateReviewCreate } from '../middleware/validation';

const reviewService = new ReviewService();

export const createReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    handleValidationErrors(req, res, () => {});

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { eventId } = req.params;
    const { transactionId, rating, comment } = req.body;

    const review = await reviewService.createReview(
      req.user.id,
      eventId,
      transactionId,
      { rating, comment }
    );

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: review,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getEventReviews = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await reviewService.getEventReviews(eventId, page, limit);

    res.status(200).json({
      success: true,
      message: 'Event reviews retrieved successfully',
      data: {
        reviews: result.reviews,
        averageRating: result.averageRating,
      },
      pagination: result.pagination,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getUserReviews = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await reviewService.getUserReviews(req.user.id, page, limit);

    res.status(200).json({
      success: true,
      message: 'User reviews retrieved successfully',
      data: result.reviews,
      pagination: result.pagination,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    handleValidationErrors(req, res, () => {});

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { reviewId } = req.params;
    const { rating, comment } = req.body;

    const review = await reviewService.updateReview(reviewId, req.user.id, {
      rating,
      comment,
    });

    res.status(200).json({
      success: true,
      message: 'Review updated successfully',
      data: review,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { reviewId } = req.params;

    const result = await reviewService.deleteReview(reviewId, req.user.id);

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
import { prisma } from '../utils/prisma';
import { ReviewCreateRequest } from '../types';

export class ReviewService {
  async createReview(userId: string, eventId: string, transactionId: string, reviewData: ReviewCreateRequest) {
    return prisma.$transaction(async (tx) => {
      // Check if user attended the event (transaction is DONE)
      const transaction = await tx.transaction.findFirst({
        where: {
          id: transactionId,
          userId,
          eventId,
          status: 'DONE',
        },
        include: {
          attendee: true,
        },
      });

      if (!transaction) {
        throw new Error('You can only review events you have attended');
      }

      // Check if user already reviewed this event
      const existingReview = await tx.review.findFirst({
        where: {
          userId,
          eventId,
          transactionId,
        },
      });

      if (existingReview) {
        throw new Error('You have already reviewed this event');
      }

      // Create review
      const review = await tx.review.create({
        data: {
          userId,
          eventId,
          transactionId,
          rating: reviewData.rating,
          comment: reviewData.comment,
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              profilePicture: true,
            },
          },
        },
      });

      return review;
    });
  }

  async getEventReviews(eventId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { eventId },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              profilePicture: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.review.count({ where: { eventId } }),
    ]);

    const averageRating = await prisma.review.aggregate({
      where: { eventId },
      _avg: { rating: true },
    });

    return {
      reviews,
      averageRating: averageRating._avg.rating || 0,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserReviews(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { userId },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.review.count({ where: { userId } }),
    ]);

    return {
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateReview(reviewId: string, userId: string, updateData: Partial<ReviewCreateRequest>) {
    const review = await prisma.review.findFirst({
      where: {
        id: reviewId,
        userId,
      },
    });

    if (!review) {
      throw new Error('Review not found or access denied');
    }

    return prisma.review.update({
      where: { id: reviewId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            profilePicture: true,
          },
        },
      },
    });
  }

  async deleteReview(reviewId: string, userId: string) {
    const review = await prisma.review.findFirst({
      where: {
        id: reviewId,
        userId,
      },
    });

    if (!review) {
      throw new Error('Review not found or access denied');
    }

    await prisma.review.delete({
      where: { id: reviewId },
    });

    return { message: 'Review deleted successfully' };
  }
}
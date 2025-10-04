import { Prisma, Event, EventTicketType } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { EventFilterParams } from '../types';
import { uploadToCloudinary } from '../utils/cloudinary';

export class EventService {
  async getEvents(filters: EventFilterParams) {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      location,
      startDate,
      endDate,
      minPrice,
      maxPrice,
    } = filters;

    const skip = (page - 1) * limit;

    // Kumpulin filter ke array dulu
    const filtersArray: Prisma.EventWhereInput[] = [];

    if (search) {
      filtersArray.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (category) {
      filtersArray.push({ category: { equals: category, mode: 'insensitive' } });
    }

    if (location) {
      filtersArray.push({ location: { contains: location, mode: 'insensitive' } });
    }

    if (startDate) {
      filtersArray.push({ startDate: { gte: new Date(startDate) } });
    }

    if (endDate) {
      filtersArray.push({ endDate: { lte: new Date(endDate) } });
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceFilter: Prisma.FloatFilter = {};
      if (minPrice !== undefined) priceFilter.gte = minPrice;
      if (maxPrice !== undefined) priceFilter.lte = maxPrice;
      filtersArray.push({ basePrice: priceFilter });
    }

    const where: Prisma.EventWhereInput = {
      isPublished: true,
      AND: filtersArray,
    };

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          organizer: {
            select: {
              id: true,
              fullName: true,
              profilePicture: true,
            },
          },
          ticketTypes: true,
          _count: {
            select: {
              reviews: true,
              attendees: true,
            },
          },
        },
        orderBy: { startDate: 'asc' },
        skip,
        take: limit,
      }),
      prisma.event.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getEventById(id: string) {
    return prisma.event.findUnique({
      where: { id },
      include: {
        organizer: {
          select: {
            id: true,
            fullName: true,
            profilePicture: true,
            email: true,
            phoneNumber: true,
          },
        },
        ticketTypes: true,
        vouchers: {
          where: {
            startDate: { lte: new Date() },
            endDate: { gte: new Date() },
            usedCount: { lt: prisma.eventVoucher.fields.maxUsage },
          },
        },
        reviews: {
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
        },
        _count: {
          select: {
            attendees: true,
            reviews: true,
          },
        },
      },
    });
  }

  async createEvent(
  organizerId: string,
  eventData: {
    title: string;
    description: string;
    category: string;
    location: string;
    address: string;
    startDate: Date;
    endDate: Date;
    availableSeats: number;
    basePrice: number;
    isPublished: boolean;
    imageUrl?: string;
  },
  ticketTypes: {
    name: string;
    price: number;
    quantity: number;
    description?: string;
  }[],
  imageFile?: Express.Multer.File
) {
  return prisma.$transaction(async (tx) => {
    let imageUrl = eventData.imageUrl;

    // Upload image to Cloudinary if provided
    if (imageFile) {
      try {
        console.log('📸 Uploading event image to Cloudinary...');
        imageUrl = await uploadToCloudinary(imageFile);
        console.log('Event image uploaded:', imageUrl);
      } catch (error) {
        console.error('Failed to upload event image:', error);
        throw new Error('Failed to upload event image');
      }
    }

    const event = await tx.event.create({
      data: {
        title: eventData.title,
        description: eventData.description,
        category: eventData.category,
        location: eventData.location,
        address: eventData.address,
        startDate: eventData.startDate,
        endDate: eventData.endDate,
        availableSeats: eventData.availableSeats, // Number
        basePrice: eventData.basePrice, // Number
        isPublished: eventData.isPublished, // Boolean
        imageUrl,
        organizerId,
      },
    });

    await tx.eventTicketType.createMany({
      data: ticketTypes.map(ticketType => ({
        name: ticketType.name,
        price: ticketType.price, // Number
        quantity: ticketType.quantity, // Number
        description: ticketType.description,
        eventId: event.id,
      })),
    });

    return event;
  });
}

  async updateEvent(
    id: string, 
    organizerId: string, 
    updateData: Partial<Event>,
    imageFile?: Express.Multer.File
  ) {
    // Upload new image if provided
    if (imageFile) {
      try {
        console.log('Uploading updated event image to Cloudinary...');
        const imageUrl = await uploadToCloudinary(imageFile);
        updateData.imageUrl = imageUrl;
        console.log('Event image updated:', imageUrl);
      } catch (error) {
        console.error('Failed to upload event image:', error);
        throw new Error('Failed to upload event image');
      }
    }

    return prisma.event.update({
      where: { id, organizerId },
      data: updateData,
    });
  }

  async getOrganizerEvents(organizerId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where: { organizerId },
        include: {
          ticketTypes: true,
          _count: {
            select: {
              transactions: true,
              attendees: true,
              reviews: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.event.count({ where: { organizerId } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getEventAnalytics(eventId: string, organizerId: string) {
    const event = await prisma.event.findFirst({
      where: { id: eventId, organizerId },
      include: {
        ticketTypes: {
          include: {
            _count: {
              select: {
                transactionItems: true,
              },
            },
          },
        },
        transactions: {
          where: {
            status: 'DONE',
          },
          include: {
            items: true,
          },
        },
        attendees: true,
        reviews: {
          select: {
            rating: true,
          },
        },
      },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    const totalRevenue = event.transactions.reduce(
      (sum, transaction) => sum + transaction.finalAmount,
      0
    );

    const averageRating =
      event.reviews.length > 0
        ? event.reviews.reduce((sum, review) => sum + review.rating, 0) / event.reviews.length
        : 0;

    const ticketSales = event.ticketTypes.map(ticketType => ({
      name: ticketType.name,
      sold: ticketType._count.transactionItems,
      total: ticketType.quantity,
      revenue: ticketType._count.transactionItems * ticketType.price,
    }));

    return {
      event: {
        id: event.id,
        title: event.title,
        bookedSeats: event.bookedSeats,
        availableSeats: event.availableSeats,
      },
      analytics: {
        totalRevenue,
        averageRating: Math.round(averageRating * 10) / 10,
        totalTransactions: event.transactions.length,
        totalAttendees: event.attendees.length,
        totalReviews: event.reviews.length,
        ticketSales,
      },
    };
  }

  // New method to update event image only
  async updateEventImage(eventId: string, organizerId: string, imageFile: Express.Multer.File) {
    // Verify event belongs to organizer
    const event = await prisma.event.findFirst({
      where: { id: eventId, organizerId },
    });

    if (!event) {
      throw new Error('Event not found or access denied');
    }

    // Upload new image
    const imageUrl = await uploadToCloudinary(imageFile);

    // Update event with new image
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: { imageUrl },
    });

    return updatedEvent;
  }
}
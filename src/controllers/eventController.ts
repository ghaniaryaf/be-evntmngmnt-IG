import { Response } from 'express';
import { AuthRequest, EventFilterParams } from '../types';
import { EventService } from '../services/eventService';
import { handleValidationErrors } from '../middleware/validation';

const eventService = new EventService();

export const getEvents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    handleValidationErrors(req, res, () => {});

    const filters: EventFilterParams = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      search: req.query.search as string,
      category: req.query.category as string,
      location: req.query.location as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
    };

    const result = await eventService.getEvents(filters);

    res.status(200).json({
      success: true,
      message: 'Events retrieved successfully',
      data: result.events,
      pagination: result.pagination,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getEventById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const event = await eventService.getEventById(id);

    if (!event) {
      res.status(404).json({
        success: false,
        message: 'Event not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Event retrieved successfully',
      data: event,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const createEvent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { ticketTypes, ...eventData } = req.body;

    // Parse semua field yang perlu conversion
    const parsedEventData = {
      ...eventData,
      // Convert string to number/boolean
      availableSeats: parseInt(eventData.availableSeats) || 0,
      basePrice: parseFloat(eventData.basePrice) || 0,
      isPublished: eventData.isPublished === 'true' || eventData.isPublished === true,
      // Parse dates
      startDate: new Date(eventData.startDate),
      endDate: new Date(eventData.endDate),
    };

    // Validate required fields
    if (!parsedEventData.title || !parsedEventData.description || !parsedEventData.category || 
        !parsedEventData.location || !parsedEventData.address || !parsedEventData.startDate || 
        !parsedEventData.endDate) {
      res.status(400).json({
        success: false,
        message: 'All event fields are required',
      });
      return;
    }

    // Validate numbers
    if (parsedEventData.availableSeats < 1) {
      res.status(400).json({
        success: false,
        message: 'availableSeats must be at least 1',
      });
      return;
    }

    if (parsedEventData.basePrice < 0) {
      res.status(400).json({
        success: false,
        message: 'basePrice cannot be negative',
      });
      return;
    }

    // Parse ticketTypes
    let parsedTicketTypes;
    if (typeof ticketTypes === 'string') {
      try {
        parsedTicketTypes = JSON.parse(ticketTypes);
      } catch (error) {
        res.status(400).json({
          success: false,
          message: 'Invalid ticketTypes format. Please provide valid JSON array.',
        });
        return;
      }
    } else {
      parsedTicketTypes = ticketTypes;
    }

    if (!Array.isArray(parsedTicketTypes) || parsedTicketTypes.length === 0) {
      res.status(400).json({
        success: false,
        message: 'ticketTypes must be a non-empty array',
      });
      return;
    }

    // Parse each ticket type fields
    const validatedTicketTypes = parsedTicketTypes.map(ticket => ({
      name: ticket.name,
      price: parseFloat(ticket.price) || 0,
      quantity: parseInt(ticket.quantity) || 0,
      description: ticket.description || '',
    }));

    // Validate each ticket type
    for (const ticket of validatedTicketTypes) {
      if (!ticket.name || ticket.price < 0 || ticket.quantity < 1) {
        res.status(400).json({
          success: false,
          message: 'Each ticket type must have valid name, price (≥ 0), and quantity (≥ 1)',
        });
        return;
      }
    }

    console.log('📸 Creating event with parsed data:');
    console.log('  - availableSeats:', parsedEventData.availableSeats, typeof parsedEventData.availableSeats);
    console.log('  - basePrice:', parsedEventData.basePrice, typeof parsedEventData.basePrice);
    console.log('  - isPublished:', parsedEventData.isPublished, typeof parsedEventData.isPublished);
    console.log('  - ticketTypes count:', validatedTicketTypes.length);

    const event = await eventService.createEvent(
      req.user.id,
      parsedEventData,
      validatedTicketTypes,
      req.file
    );

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: event,
    });
  } catch (error: any) {
    console.error('Create event error:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateEvent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    handleValidationErrors(req, res, () => {});

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { id } = req.params;

    console.log('📸 Updating event with image file:', req.file ? 'Yes' : 'No');

    const event = await eventService.updateEvent(
      id, 
      req.user.id, 
      req.body,
      req.file // Pass the uploaded image file for update
    );

    res.status(200).json({
      success: true,
      message: 'Event updated successfully',
      data: event,
    });
  } catch (error: any) {
    console.error('❌ Update event error:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// New endpoint for updating event image only
export const updateEventImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'Event image file is required',
      });
      return;
    }

    const { id } = req.params;

    console.log('📸 Updating event image only for event:', id);

    const event = await eventService.updateEventImage(id, req.user.id, req.file);

    res.status(200).json({
      success: true,
      message: 'Event image updated successfully',
      data: event,
    });
  } catch (error: any) {
    console.error('❌ Update event image error:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getOrganizerEvents = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const result = await eventService.getOrganizerEvents(req.user.id, page, limit);

    res.status(200).json({
      success: true,
      message: 'Organizer events retrieved successfully',
      data: result.events,
      pagination: result.pagination,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getEventAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { id } = req.params;
    const analytics = await eventService.getEventAnalytics(id, req.user.id);

    res.status(200).json({
      success: true,
      message: 'Event analytics retrieved successfully',
      data: analytics,
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};
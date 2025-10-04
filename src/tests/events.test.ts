import request from 'supertest';
import app from '../app';
import { prisma } from '../utils/prisma';

describe('Events API', () => {
  let authToken: string;
  let organizerToken: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up database
    await prisma.event.deleteMany();
    await prisma.user.deleteMany();

    // Create test users
    const customerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'customer@example.com',
        password: 'password123',
        fullName: 'Test Customer',
      });

    authToken = customerResponse.body.data.token;

    const organizerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'organizer@example.com',
        password: 'password123',
        fullName: 'Test Organizer',
      });

    organizerToken = organizerResponse.body.data.token;

    // Update user role to organizer
    await prisma.user.update({
      where: { email: 'organizer@example.com' },
      data: { role: 'ORGANIZER' },
    });
  });

  describe('GET /api/events', () => {
    it('should get events with pagination', async () => {
      const response = await request(app)
        .get('/api/events')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });

    it('should filter events by category', async () => {
      const response = await request(app)
        .get('/api/events?category=Music')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/events', () => {
    it('should create event as organizer', async () => {
      const eventData = {
        title: 'Test Event',
        description: 'Test Description',
        category: 'Music',
        location: 'Jakarta',
        address: 'Test Address',
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days from now
        availableSeats: 100,
        basePrice: 100000,
        ticketTypes: [
          {
            name: 'Regular',
            price: 100000,
            quantity: 100,
            description: 'Regular ticket',
          },
        ],
      };

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.event.title).toBe(eventData.title);
    });

    it('should not create event as customer', async () => {
      const eventData = {
        title: 'Test Event',
        description: 'Test Description',
        category: 'Music',
        location: 'Jakarta',
        address: 'Test Address',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        availableSeats: 100,
        basePrice: 100000,
      };

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(eventData)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });
});
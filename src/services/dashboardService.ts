import { prisma } from '../utils/prisma';

export class DashboardService {
  async getOrganizerStats(organizerId: string) {
    const now = new Date();
    
    const [
      totalEvents,
      totalTransactions,
      totalRevenue,
      upcomingEvents,
      recentTransactions,
      popularEvents
    ] = await Promise.all([
      // Total events
      prisma.event.count({
        where: { organizerId }
      }),

      // Total transactions
      prisma.transaction.count({
        where: {
          event: { organizerId },
          status: 'DONE'
        }
      }),

      // Total revenue
      prisma.transaction.aggregate({
        where: {
          event: { organizerId },
          status: 'DONE'
        },
        _sum: {
          finalAmount: true
        }
      }),

      // Upcoming events (within next 30 days)
      prisma.event.count({
        where: {
          organizerId,
          startDate: {
            gte: now,
            lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
          }
        }
      }),

      // Recent transactions (last 7 days)
      prisma.transaction.findMany({
        where: {
          event: { organizerId },
          status: 'DONE',
          createdAt: {
            gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
          }
        },
        include: {
          event: {
            select: {
              title: true
            }
          },
          user: {
            select: {
              fullName: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 5
      }),

      // Popular events (by transaction count)
      prisma.event.findMany({
        where: { organizerId },
        include: {
          _count: {
            select: {
              transactions: {
                where: { status: 'DONE' }
              }
            }
          },
          transactions: {
            where: { status: 'DONE' },
            select: {
              finalAmount: true
            }
          }
        },
        orderBy: {
          transactions: {
            _count: 'desc'
          }
        },
        take: 5
      })
    ]);

    return {
      totalEvents,
      totalTransactions,
      totalRevenue: totalRevenue._sum.finalAmount || 0,
      upcomingEvents,
      recentTransactions,
      popularEvents: popularEvents.map(event => ({
        id: event.id,
        title: event.title,
        transactionCount: event._count.transactions,
        totalRevenue: event.transactions.reduce((sum, t) => sum + t.finalAmount, 0)
      }))
    };
  }

  async getOrganizerAnalytics(organizerId: string, year: number = 2024, month?: number) {
    const startDate = month 
      ? new Date(year, month - 1, 1) // Specific month
      : new Date(year, 0, 1); // Whole year
    
    const endDate = month
      ? new Date(year, month, 0, 23, 59, 59) // End of month
      : new Date(year, 11, 31, 23, 59, 59); // End of year

    // Monthly revenue data
    const monthlyRevenue = await prisma.transaction.groupBy({
      by: ['createdAt'],
      where: {
        event: { organizerId },
        status: 'DONE',
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: {
        finalAmount: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Event performance
    const eventPerformance = await prisma.event.findMany({
      where: {
        organizerId,
        OR: [
          {
            startDate: {
              gte: startDate,
              lte: endDate
            }
          },
          {
            transactions: {
              some: {
                createdAt: {
                  gte: startDate,
                  lte: endDate
                }
              }
            }
          }
        ]
      },
      include: {
        _count: {
          select: {
            transactions: {
              where: { status: 'DONE' }
            },
            attendees: true,
            reviews: true
          }
        },
        transactions: {
          where: { status: 'DONE' },
          select: {
            finalAmount: true
          }
        },
        reviews: {
          select: {
            rating: true
          }
        }
      }
    });

    // Ticket sales by type
    const ticketSales = await prisma.transactionItem.groupBy({
      by: ['ticketTypeId'],
      where: {
        transaction: {
          event: { organizerId },
          status: 'DONE',
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        }
      },
      _sum: {
        quantity: true,
        subtotal: true
      },
      _count: {
        transactionId: true
      }
    });

    // Get ticket type names
    const ticketTypes = await prisma.eventTicketType.findMany({
      where: {
        id: {
          in: ticketSales.map(sale => sale.ticketTypeId)
        }
      },
      select: {
        id: true,
        name: true,
        price: true
      }
    });

    const ticketSalesWithNames = ticketSales.map(sale => {
      const ticketType = ticketTypes.find(t => t.id === sale.ticketTypeId);
      return {
        ticketType: ticketType?.name || 'Unknown',
        quantity: sale._sum.quantity || 0,
        revenue: sale._sum.subtotal || 0,
        transactionCount: sale._count.transactionId || 0
      };
    });

    return {
      period: {
        startDate,
        endDate,
        year,
        month: month || null
      },
      monthlyRevenue: monthlyRevenue.map(item => ({
        date: item.createdAt,
        revenue: item._sum.finalAmount || 0
      })),
      eventPerformance: eventPerformance.map(event => ({
        id: event.id,
        title: event.title,
        totalRevenue: event.transactions.reduce((sum, t) => sum + t.finalAmount, 0),
        ticketSales: event._count.transactions,
        attendees: event._count.attendees,
        averageRating: event.reviews.length > 0 
          ? event.reviews.reduce((sum, r) => sum + r.rating, 0) / event.reviews.length 
          : 0
      })),
      ticketSales: ticketSalesWithNames
    };
  }
}
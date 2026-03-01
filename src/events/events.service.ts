import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) { }

  private sanitizeUser<T extends { password?: any }>(user: T): Omit<T, 'password'> {
    if (!user) return user as any;
    const { password, ...rest } = user as any;
    return rest;
  }

  private sanitizeEvent(event: any, isFavorite = false) {
    if (!event) return event;
    const sanitized = event.user ? { ...event, user: this.sanitizeUser(event.user) } : { ...event };
    return { ...sanitized, favorito: isFavorite };
  }

  async updateDatesToCurrentYear() {
    const dates = await this.prisma.eventDate.findMany();
    const currentYear = new Date().getFullYear();
    let updated = 0;

    for (const d of dates) {
      const newDate = new Date(d.date);
      if (newDate.getFullYear() < currentYear) {
        newDate.setFullYear(currentYear);
        newDate.setUTCHours(12);
        await this.prisma.eventDate.update({
          where: { id: d.id },
          data: { date: newDate }
        });
        updated++;
      }
    }
    return { message: `Updated ${updated} dates to ${currentYear}` };
  }

  // Fix all dates stored at UTC midnight (T00:00:00Z) to noon UTC (T12:00:00Z).
  // Events created via admin UI on Railway (UTC server) were stored at midnight,
  // which appears as the previous day at 7pm in Lima (UTC-5).
  async fixDatesToNoonUTC() {
    const dates = await this.prisma.eventDate.findMany();
    let updated = 0;
    for (const d of dates) {
      const stored = new Date(d.date);
      if (stored.getUTCHours() < 6) {
        const fixed = new Date(stored);
        fixed.setUTCHours(12, 0, 0, 0);
        await this.prisma.eventDate.update({ where: { id: d.id }, data: { date: fixed } });
        updated++;
      }
    }
    return { message: `Fixed ${updated} event dates to noon UTC` };
  }

  async deleteAll() {
    try {
      // Attempt to delete all events. 
      // If there are foreign key constraints without cascade delete, this might fail.
      // But typically for this project structure, cascade should be enabled or cleaning up is straightforward.
      const result = await this.prisma.event.deleteMany({});
      return { success: true, count: result.count, message: 'Todos los eventos han sido eliminados' };
    } catch (error) {
      console.error('Error deleting all events:', error);
      throw new BadRequestException('No se pudieron eliminar los eventos');
    }
  }

  async create(userId: string, isCompany: boolean, dto: CreateEventDto) {
    if (!isCompany) {
      throw new ForbiddenException('Solo usuarios COMPANY pueden crear eventos');
    }

    let locationId: string | undefined = undefined;
    if (dto.department && dto.province && dto.district) {
      const location = await this.prisma.location.create({
        data: {
          name: dto.locationName,
          department: dto.department,
          province: dto.province,
          district: dto.district,
          address: dto.address,
          latitude: dto.latitude,
          longitude: dto.longitude,
        },
      });
      locationId = location.id;
    }

    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        imageUrl: dto.imageUrl,
        bannerUrl: dto.bannerUrl,
        websiteUrl: dto.websiteUrl,
        ticketUrls: dto.ticketUrls || undefined,
        isFeatured: dto.isFeatured ?? false,
        isBanner: dto.isBanner ?? false,
        userId,
        locationId,
        dates: {
          create: dto.dates.map((d) => {
            // Force noon UTC to avoid timezone date-shift issues.
            // On Railway (UTC server), new Date(y,m,d) creates T00:00:00Z (UTC midnight)
            // which appears as the previous day at 7pm in Lima (UTC-5).
            // Storing at T12:00:00Z (noon UTC = 7am Lima) keeps the date correct in all timezones.
            const [year, month, day] = d.date.split('-').map(Number);
            const dateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

            return {
              date: dateObj,
              startTime: d.startTime,
              endTime: d.endTime,
              price: d.price,
              capacity: d.capacity,
            };
          }),
        },
      },
      include: {
        dates: true,
        location: true,
        user: { include: { profile: true } },
      },
    });

    return this.sanitizeEvent(event);
  }

  async findAll(page = 1, limit = 20, status = 'active', isFeatured?: boolean, search?: string, userId?: string, isBanner?: boolean) {
    const skip = (page - 1) * limit;

    const whereClause: any = {};

    // Status Filter
    if (status === 'active') {
      whereClause.isActive = true;
    } else if (status === 'inactive') {
      whereClause.isActive = false;
    }

    if (isFeatured !== undefined) {
      whereClause.isFeatured = isFeatured;
    }

    if (isBanner !== undefined) {
      whereClause.isBanner = isBanner;
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { location: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Only return events that have at least one upcoming/today date
    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);
    whereClause.dates = { some: { date: { gte: todayUTC } } };

    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where: whereClause,
        include: {
          dates: true,
          location: true,
          user: { include: { profile: true } },
          _count: { select: { favorites: true, comments: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.event.count({ where: whereClause }),
    ]);

    const eventIds = data.map((e) => e.id);
    let favoritesSet = new Set<string>();

    if (userId) {
      const favorites = await this.prisma.favorite.findMany({
        where: {
          userId,
          eventId: { in: eventIds },
        },
      });
      favoritesSet = new Set(favorites.map((f) => f.eventId));
    }

    // Filter valid dates and sort (logic from earlier conversation)
    // For 'findAll', we usually want recent created, but user requested chronological order
    // However, findAll is generic paginated list. Let's keep createdAt desc for now OR use the smart sorting if requested.
    // The previous 'findAll' fix was specifically for "Eventos para ti" which might use 'findAll' or 'feed'.
    // The Controller says "Listar eventos (paginado)", default sorting is CreatedAt Desc in DB.
    // But we need to filter dates < now if we want "Active" real events.
    // Let's stick to standard DB query for now to generic findAll, but map favorites.
    // If strict date filtering is needed, it should be in filter logic.
    // BUT! "active" events usually implies future.
    // Let's apply standard logic:

    const mapped = data.map((e) => {
      // Filter dates to show only future? optional. 
      // For general list, maybe we clarify in frontend. 
      // Let's just map sanitized.
      return this.sanitizeEvent(e, favoritesSet.has(e.id));
    });

    return {
      data: mapped,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where: { userId, isActive: true },
        include: {
          dates: true,
          location: true,
          _count: { select: { favorites: true, comments: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.event.count({ where: { userId, isActive: true } }),
    ]);

    const eventIds = data.map((e) => e.id);
    let favoritesSet = new Set<string>();

    // Current user viewing another user's profile? Or viewing own?
    // We don't have 'currentUserId' passed to findByUser in Controller (it uses @Param userId). 
    // Wait, controller finds by user. If I am viewing events of User X, I want to know if I (User Y) liked them.
    // Controller 'findByUser' does NOT take @GetUser('id') currentUserId.
    // We should probably leave this as is or update controller later.
    // For now, restoring original logic which assumes sanitized without auth context check, OR implicit check?
    // The original code passed 'userId' (the param) to check favorites? No that checks if the OWNER liked their own event.
    // Let's leave findByUser as is, focused on findAll/findFeatured.

    if (userId) {
      const favorites = await this.prisma.favorite.findMany({
        where: {
          userId, // This checks if the AUTHOR liked it? 
          eventId: { in: eventIds },
        },
      });
      favoritesSet = new Set(favorites.map((f) => f.eventId));
    }

    return {
      data: data.map((e) => this.sanitizeEvent(e, favoritesSet.has(e.id))),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findFeatured(userId?: string) {
    const data = await this.prisma.event.findMany({
      where: { isActive: true, isFeatured: true },
      include: {
        dates: true,
        location: true,
        _count: { select: { favorites: true, comments: true } },
      },
    });

    let favoritesSet = new Set<string>();
    if (userId) {
      const eventIds = data.map(e => e.id);
      const favorites = await this.prisma.favorite.findMany({
        where: {
          userId,
          eventId: { in: eventIds },
        },
      });
      favoritesSet = new Set(favorites.map((f) => f.eventId));
    }

    // Filter out events with no future dates
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const futureEvents = data.filter(event => {
      if (!event.dates || event.dates.length === 0) return false;
      return event.dates.some(d => {
        const eventDate = new Date(d.date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate.getTime() >= now.getTime();
      });
    });

    // Sort by next upcoming date
    futureEvents.sort((a, b) => {
      const getNextUpcomingDate = (e: any) => {
        const upcomingDates = e.dates
          .map((d: any) => new Date(d.date))
          .filter((date: Date) => {
            const compareDate = new Date(date);
            compareDate.setHours(0, 0, 0, 0);
            return compareDate.getTime() >= now.getTime();
          })
          .sort((a: Date, b: Date) => a.getTime() - b.getTime());

        return upcomingDates.length > 0 ? upcomingDates[0] : new Date(8640000000000000);
      };

      const dateA = getNextUpcomingDate(a);
      const dateB = getNextUpcomingDate(b);

      return dateA.getTime() - dateB.getTime();
    });

    const mapped = futureEvents.map(e => this.sanitizeEvent(e, favoritesSet.has(e.id)));
    return { data: mapped, total: futureEvents.length, page: 1, totalPages: 1 };
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        dates: true,
        location: true,
        user: { include: { profile: true } },
        _count: { select: { favorites: true, comments: true } },
      },
    });
    if (!event) throw new NotFoundException('Evento no encontrado');
    return this.sanitizeEvent(event);
  }

  async getDates(id: string) {
    return this.prisma.eventDate.findMany({ where: { eventId: id }, orderBy: { date: 'asc' } });
  }

  async search(query: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where: {
          isActive: true,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { location: { name: { contains: query, mode: 'insensitive' } } },
          ],
        },
        include: { dates: true, location: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.event.count({
        where: {
          isActive: true,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { location: { name: { contains: query, mode: 'insensitive' } } },
          ],
        },
      }),
    ]);

    // Filter out past dates from each event
    // Filter out past dates from each event and sort them
    const filteredData = data
      .map(event => {
        // Filter dates
        const upcomingDates = event.dates.filter(date => {
          const eventDate = new Date(date.date);
          eventDate.setHours(0, 0, 0, 0);
          return eventDate >= today;
        });

        // Sort dates ascending (nearest first)
        upcomingDates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return {
          ...event,
          dates: upcomingDates,
        };
      })
      .filter(event => event.dates.length > 0) // Only include events with future dates
      .sort((a, b) => {
        // Sort events by their first (nearest) date
        const dateA = a.dates[0] ? new Date(a.dates[0].date).getTime() : Infinity;
        const dateB = b.dates[0] ? new Date(b.dates[0].date).getTime() : Infinity;
        return dateA - dateB;
      });

    return {
      data: filteredData,
      total: filteredData.length,
      page,
      totalPages: Math.ceil(filteredData.length / limit)
    };
  }

  async byCategory(category: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where: { isActive: true, category },
        include: { dates: true, location: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.event.count({ where: { isActive: true, category } }),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async feed(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const following = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId);

    // Logica Smart Feed:
    // Si sigue a usuarios -> Mostrar eventos propios + seguidos + destacados
    // Si NO sigue a nadie -> Mostrar "Discovery Mode": Todos los eventos activos (priorizando destacados y recientes)

    // NOTA: Si se desea mezclar siempre, podríamos quitar el `if`.
    // Por ahora, asumimos que si sigues, quieres ver eso. Si no, quieres descubrir.

    let where: any = { isActive: true };

    if (followingIds.length > 0) {
      where.OR = [
        { userId },
        { userId: { in: followingIds } },
        { isFeatured: true }, // Siempre incluir destacados para enriquecer
      ];
    } else {
      // Discovery Mode: Mostrar todo lo activo (el ordenamiento por fecha hará el resto)
      // Opcional: Podríamos filtrar solo UserType=COMPANY si tuvieramos acceso fácil, pero el modelo Event no tiene userType directo.
      // Dado que solo Company crea eventos, esto es seguro.
      where = { isActive: true };
    }

    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: {
          dates: true,
          location: true,
          user: { include: { profile: true } },
          _count: { select: { favorites: true, comments: true } },
        },
        skip,
        take: limit,
        orderBy: [
          { isFeatured: 'desc' }, // Destacados primero (opcional, o mezclar)
          { createdAt: 'desc' }
        ],
      }),
      this.prisma.event.count({ where }),
    ]);

    const eventIds = data.map((e) => e.id);
    let favoritesSet = new Set<string>();

    if (userId) {
      const favorites = await this.prisma.favorite.findMany({
        where: {
          userId,
          eventId: { in: eventIds },
        },
      });
      favoritesSet = new Set(favorites.map((f) => f.eventId));
    }

    return {
      data: data.map((e) => this.sanitizeEvent(e, favoritesSet.has(e.id))),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getComments(eventId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.eventComment.findMany({
        where: { eventId, parentId: null }, // Only top-level comments
        include: {
          user: { include: { profile: true } },
          replies: {
            include: {
              user: { include: { profile: true } },
              likes: true, // simplified for checking if liked
              _count: { select: { likes: true } }
            },
            orderBy: { createdAt: 'asc' }
          },
          likes: true,
          _count: { select: { likes: true, replies: true } }
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.eventComment.count({ where: { eventId, parentId: null } }),
    ]);

    // Helper to format comment
    const formatComment = (c: any) => ({
      ...c,
      user: this.sanitizeUser(c.user),
      replies: c.replies?.map((r: any) => ({
        ...r,
        user: this.sanitizeUser(r.user),
        isLiked: false, // Default, updated in controller if userId passed? OR sanitize passing userId down?
        // Ideally we start passing userId to getComments to check isLiked
      })) || [],
      isLiked: false
    });

    return {
      data: data.map(formatComment),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };

  }

  async addComment(userId: string, eventId: string, content?: string, parentId?: string) {
    if (!content) throw new BadRequestException('El contenido del comentario es requerido');

    const comment = await this.prisma.eventComment.create({
      data: {
        userId,
        eventId,
        content,
        parentId, // Optional parentId for replies
      },
      include: {
        user: { include: { profile: true } },
      },
    });

    return { ...comment, user: this.sanitizeUser(comment.user), replies: [], _count: { likes: 0, replies: 0 } };
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.eventComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comentario no encontrado');
    if (comment.userId !== userId) throw new ForbiddenException('No autorizado para eliminar este comentario');

    await this.prisma.eventComment.delete({ where: { id: commentId } });
    return { message: 'Comentario eliminado' };
  }

  async editComment(userId: string, commentId: string, content: string) {
    const comment = await this.prisma.eventComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comentario no encontrado');
    if (comment.userId !== userId) throw new ForbiddenException('No autorizado para editar este comentario');

    const updated = await this.prisma.eventComment.update({
      where: { id: commentId },
      data: { content },
      include: { user: { include: { profile: true } } }
    });
    return { ...updated, user: this.sanitizeUser(updated.user) };
  }

  async toggleCommentLike(userId: string, commentId: string) {
    const existing = await this.prisma.eventCommentLike.findUnique({
      where: { userId_commentId: { userId, commentId } }
    });

    if (existing) {
      await this.prisma.eventCommentLike.delete({
        where: { userId_commentId: { userId, commentId } }
      });
      return { isLiked: false };
    } else {
      await this.prisma.eventCommentLike.create({
        data: { userId, commentId }
      });
      return { isLiked: true };
    }
  }

  async myEvents(userId: string) {
    return this.prisma.event.findMany({
      where: { userId },
      include: { dates: true, location: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(userId: string, id: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.userId !== userId) throw new ForbiddenException('No autorizado');

    // Handle Location
    let locationId = event.locationId;
    const hasLocationFields = dto.department || dto.province || dto.district || dto.locationName || dto.address;

    if (hasLocationFields) {
      if (locationId) {
        await this.prisma.location.update({
          where: { id: locationId },
          data: {
            name: dto.locationName,
            department: dto.department,
            province: dto.province,
            district: dto.district,
            address: dto.address,
            latitude: dto.latitude,
            longitude: dto.longitude,
          },
        });
      } else {
        const newLoc = await this.prisma.location.create({
          data: {
            name: dto.locationName,
            department: dto.department ?? 'Lima',
            province: dto.province ?? 'Lima',
            district: dto.district ?? '',
            address: dto.address,
            latitude: dto.latitude,
            longitude: dto.longitude,
          },
        });
        locationId = newLoc.id;
      }
    }

    // Handle Dates (Delete & Re-create if provided)
    if (dto.dates && dto.dates.length > 0) {
      await this.prisma.eventDate.deleteMany({ where: { eventId: id } });
      await this.prisma.eventDate.createMany({
        data: dto.dates.map((d) => {
          // Force noon UTC to prevent 1-day shift in Lima (UTC-5).
          // On Railway (UTC server), new Date(y,m,d) creates T00:00:00Z which
          // appears as the previous day at 7pm Lima time.
          const [year, month, day] = d.date.split('-').map(Number);
          const dateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

          return {
            eventId: id,
            date: dateObj,
            startTime: d.startTime,
            endTime: d.endTime,
            price: d.price,
            capacity: d.capacity,
          };
        }),
      });
    }

    return this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        imageUrl: dto.imageUrl,
        bannerUrl: dto.bannerUrl,
        websiteUrl: dto.websiteUrl,
        ticketUrls: dto.ticketUrls !== undefined ? dto.ticketUrls : undefined,
        isFeatured: dto.isFeatured,
        isBanner: dto.isBanner,
        locationId,
      },
      include: { dates: true, location: true },
    });
  }

  async toggleStatus(userId: string, id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.userId !== userId) throw new ForbiddenException('No autorizado');

    return this.prisma.event.update({
      where: { id },
      data: { isActive: !event.isActive },
    });
  }

  async remove(userId: string, id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.userId !== userId) throw new ForbiddenException('No autorizado');

    await this.prisma.event.delete({ where: { id } });
    return { message: 'Evento eliminado' };
  }

  async relatedByEvent(eventId: string, excludeFeatured = false) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { category: true },
    });
    if (!event) throw new NotFoundException('Evento no encontrado');

    return this.prisma.event.findMany({
      where: {
        isActive: true,
        category: event.category,
        id: { not: eventId },
        ...(excludeFeatured ? { isFeatured: false } : {}),
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { dates: true, location: true },
    });
  }

  async relatedByCategory(category: string, excludeFeatured = false) {
    const where: any = { isActive: true, category };
    if (excludeFeatured) where.isFeatured = false;
    return this.prisma.event.findMany({
      where,
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { dates: true },
    });
  }

  async statsByCategory() {
    // Get all categories from database
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });

    // Only count events that have at least one future/today date
    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);

    // Count per category using individual count queries (groupBy can't filter by nested relation)
    const countsMap: Record<string, number> = {};
    await Promise.all(
      categories.map(async (cat) => {
        const count = await this.prisma.event.count({
          where: {
            isActive: true,
            category: cat.name,
            dates: { some: { date: { gte: todayUTC } } },
          },
        });
        countsMap[cat.name] = count;
      })
    );

    // Return formatted response with category data
    return categories.map(cat => ({
      idCategorias: cat.id,
      nombreCategoria: cat.name,
      iconos: cat.icon,
      cantidad: countsMap[cat.name] || 0,
      estado: cat.isActive ? 1 : 0,
    }));
  }

  async getEventDetailByDate(eventId: string, dateId: string, userId?: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        user: { include: { profile: true } },
        location: true,
        dates: { orderBy: { date: 'asc' } },
        _count: { select: { favorites: true, comments: true } },
        ...(userId ? { favorites: { where: { userId } } } : {}),
      },
    });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.dates.length === 0) throw new NotFoundException('Fecha no encontrada');

    // Filter out past dates - only keep dates >= today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureDates = event.dates.filter((d: any) => {
      const eventDate = new Date(d.date);
      eventDate.setHours(0, 0, 0, 0);
      return eventDate.getTime() >= today.getTime();
    });

    const result = this.sanitizeEvent({ ...event, dates: futureDates });

    if (userId && (event as any).favorites?.length > 0) {
      result.favorito = (event as any).favorites[0].id;
    } else {
      result.favorito = false;
    }

    return result;
  }

  async searchPublicEvents(filters: {
    categoria?: string;
    departamento?: string;
    provincia?: string;
    distrito?: string;
    fechaInicio?: string;
    fechaFin?: string;
    busqueda?: string;
    esGratis?: boolean;
    enCurso?: boolean;
    horaInicio?: string;
    horaFin?: string;
    excludeFeatured?: boolean;
    expandDates?: boolean;
    page?: number;
    limit?: number;
    userId?: string;
  }) {
    const { categoria, departamento, provincia, distrito, fechaInicio, fechaFin, busqueda, esGratis, enCurso, horaInicio, horaFin, excludeFeatured, expandDates = true, page = 1, limit = 20, userId } = filters;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };

    if (excludeFeatured) {
      where.isFeatured = false;
    }

    if (categoria) {
      where.category = { equals: categoria, mode: 'insensitive' };
    }
    if (busqueda) {
      where.OR = [
        { title: { contains: busqueda, mode: 'insensitive' } },
        { location: { name: { contains: busqueda, mode: 'insensitive' } } },
      ];
    }
    if (departamento || provincia || distrito) {
      where.location = {};
      if (departamento) where.location.department = { equals: departamento, mode: 'insensitive' };
      if (provincia) where.location.province = { equals: provincia, mode: 'insensitive' };
      if (distrito) where.location.district = { equals: distrito, mode: 'insensitive' };
    }

    const datesWhere: any = {};

    // Apply date filters directly - we want events with dates in the specified range
    if (fechaInicio) datesWhere.date = { ...datesWhere.date, gte: new Date(fechaInicio) };
    if (fechaFin) datesWhere.date = { ...datesWhere.date, lte: new Date(fechaFin) };

    // Combine logic for datesWhere. Using AND array allows safe combination of OR conditions (like esGratis) and Time logic
    datesWhere.AND = [];

    if (String(esGratis) === 'true') {
      datesWhere.AND.push({
        OR: [
          { price: 0 },
          { price: null }
        ]
      });
    }

    if (horaInicio && horaFin) {
      if (horaInicio > horaFin) {
        // Crossover midnight logic: Start > End (e.g. 18:00 to 06:00)
        // Time must be >= 18:00 OR <= 06:00
        datesWhere.AND.push({
          OR: [
            { startTime: { gte: horaInicio } },
            { startTime: { lte: horaFin } }
          ]
        });
      } else {
        // Standard range
        datesWhere.AND.push({
          startTime: { gte: horaInicio, lte: horaFin }
        });
      }
    } else {
      if (horaInicio) datesWhere.AND.push({ startTime: { gte: horaInicio } });
      if (horaFin) datesWhere.AND.push({ startTime: { lte: horaFin } });
    }

    if (String(enCurso) === 'true') {
      // "En Curso" usually means from today onwards. 
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      datesWhere.date = { ...datesWhere.date, gte: today };
    }

    // Since we use datesWhere.AND, we need to ensure datesWhere itself is valid structure.
    // However, datesWhere also has 'date' property directly assigned above?
    // Wait, datesWhere structure for Prisma: { AND: [...], date: ... } works fine.
    // Just need to ensure if AND is empty we don't break things?
    // Empty AND [] is fine usually or we can check length.

    if (Object.keys(datesWhere).length > 0) { // AND is a key 
      where.dates = { some: datesWhere };
    }

    // Fetch ALL candidates that match filtered criteria (except strict date range if ignoring year)
    // We fetch a bit more or all? Fetching all might be heavy if db grows, but for now safe.
    // Actually, we must fetch all matching category/text to filter manually by date.

    // Determine pagination strategy:
    // If NOT ignoring year and just doing standard filters, we could use skip/take here.
    // But to be consistent with the hack, we fetch all if ignoring year.
    // If not ignoring year, we SHOULD use skip/take in query for performance, but mixing strategies is complex.
    // Let's assume we fetch all for correct filtering of 'dates' array inside event too?
    // No, event has many dates. We check if event has ANY date matches.
    const allMatchingEvents = await this.prisma.event.findMany({
      where,
      include: {
        dates: true,
        location: true,
        user: { include: { profile: true } },
        ...(userId ? { favorites: { where: { userId } } } : {})
      },
      orderBy: { createdAt: 'desc' },
    });

    let filteredEvents = allMatchingEvents;

    // Filter out past events first
    filteredEvents = filteredEvents.filter(event => {
      if (!event.dates || event.dates.length === 0) return false;
      const checkDate = new Date(fechaInicio || new Date());
      checkDate.setHours(0, 0, 0, 0);

      return event.dates.some(d => {
        const eventDate = new Date(d.date);
        const eDate = new Date(eventDate);
        eDate.setHours(0, 0, 0, 0);

        // Time filter pre-check optimization? No, just check date overlap here.
        return eDate.getTime() >= checkDate.getTime();
      });
    });

    let resultItems: any[] = [];

    // Parse filterDate once
    let filterDate: Date;
    if (fechaInicio) {
      const [year, month, day] = fechaInicio.split('-').map(Number);
      filterDate = new Date(year, month - 1, day);
    } else {
      filterDate = new Date();
    }
    filterDate.setHours(0, 0, 0, 0);

    if (expandDates) {
      // 1. Expand ALL matching events into individual date instances
      resultItems = filteredEvents.flatMap((e) => {
        // Filter dates just like before
        const validDates = e.dates.filter((d: any) => {
          const eDate = new Date(d.date);
          eDate.setHours(0, 0, 0, 0);
          if (eDate.getTime() < filterDate.getTime()) return false;

          if (horaInicio || horaFin) {
            const eventTime = d.startTime;
            if (horaInicio && horaFin) {
              if (horaInicio > horaFin) return eventTime >= horaInicio || eventTime <= horaFin;
              return eventTime >= horaInicio && eventTime <= horaFin;
            } else if (horaInicio) return eventTime >= horaInicio;
            else if (horaFin) return eventTime <= horaFin;
          }
          return true;
        });

        // Map each valid date to a sanitized event instance
        return validDates.map((date) => {
          const sanitized = this.sanitizeEvent({ ...e, dates: [date] });
          if (userId && (e as any).favorites?.length > 0) {
            sanitized.favorito = (e as any).favorites[0].id;
          } else {
            sanitized.favorito = false;
          }
          // Attach sorting key for easier sort
          (sanitized as any)._sortDate = new Date(date.date).getTime();
          return sanitized;
        });
      });

      // 2. Sort the expanded list
      resultItems.sort((a, b) => a._sortDate - b._sortDate);

    } else {
      // Logic for non-expanded (grouped) events
      // Sort chronologically by the next upcoming date 
      filteredEvents.sort((a, b) => {
        const getNextUpcomingDate = (e: any) => {
          if (!e.dates || e.dates.length === 0) return new Date(8640000000000000);
          let referenceDate = new Date(filterDate);
          const upcomingDates = e.dates
            .map((d: any) => new Date(d.date))
            .filter((date: Date) => {
              const compareDate = new Date(date);
              compareDate.setHours(0, 0, 0, 0);
              return compareDate.getTime() >= referenceDate.getTime();
            })
            .sort((a: Date, b: Date) => a.getTime() - b.getTime());
          return upcomingDates.length > 0 ? upcomingDates[0] : new Date(8640000000000000);
        };
        const dateA = getNextUpcomingDate(a);
        const dateB = getNextUpcomingDate(b);
        return dateA.getTime() - dateB.getTime();
      });

      // Filter inner dates and verify if event still has active dates with filters
      resultItems = filteredEvents.map(e => {
        const validDates = e.dates.filter((d: any) => {
          const eDate = new Date(d.date);
          eDate.setHours(0, 0, 0, 0);
          if (eDate.getTime() < filterDate.getTime()) return false;
          if (horaInicio || horaFin) {
            const eventTime = d.startTime;
            if (horaInicio && horaFin) {
              if (horaInicio > horaFin) return eventTime >= horaInicio || eventTime <= horaFin;
              return eventTime >= horaInicio && eventTime <= horaFin;
            }
            if (horaInicio) return eventTime >= horaInicio;
            if (horaFin) return eventTime <= horaFin;
          }
          return true;
        });
        if (validDates.length === 0) return null; // Remove if no valid dates remain after filter

        // Use active dates for display? Or all? Usually just the valid ones for this search.
        const sanitized = this.sanitizeEvent({ ...e, dates: validDates });
        if (userId && (e as any).favorites?.length > 0) {
          sanitized.favorito = (e as any).favorites[0].id;
        } else {
          sanitized.favorito = false;
        }
        return sanitized;
      }).filter(Boolean); // Filter out nulls
    }

    const total = resultItems.length;
    // 3. Paginate the FINAL list
    const paginatedItems = resultItems.slice(skip, skip + limit);

    return {
      eventos: paginatedItems,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}

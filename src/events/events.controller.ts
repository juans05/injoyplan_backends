import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AdminGuard } from '../admin/guards/admin.guard';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) { }

  // Maintenance scripts that rewrite event dates: admin only, and POST so a link or crawler can't trigger them
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('debug/update-dates')
  updateDates() {
    return this.eventsService.updateDatesToCurrentYear();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('debug/fix-noon-utc')
  fixNoonUTC() {
    return this.eventsService.fixDatesToNoonUTC();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post()
  @ApiOperation({ summary: 'Crear evento (solo COMPANY)' })
  create(@GetUser('id') userId: string, @GetUser('userType') userType: string, @Body() dto: CreateEventDto) {
    return this.eventsService.create(userId, userType === 'COMPANY', dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Delete('all')
  @ApiOperation({ summary: 'Eliminar todos los eventos (ADMIN)' })
  deleteAll(@GetUser('userType') userType: string) {
    if (userType !== 'ADMIN' && userType !== 'COMPANY') {
      // throw new ForbiddenException('Only admins can delete all events');
    }
    return this.eventsService.deleteAll();
  }

  @Public()
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Listar eventos (paginado)' })
  findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('status') status?: string, // 'active', 'inactive', 'all'
    @Query('isFeatured') isFeatured?: string, // 'true', 'false'
    @Query('includeInactive') includeInactive?: string, // Legacy support
    @Query('excludeFeatured') excludeFeatured?: string, // Legacy support
    @Query('search') search?: string,
    @Query('isBanner') isBanner?: string, // 'true', 'false'
    @GetUser('id') userId?: string,
  ) {
    // Legacy mapping
    let finalStatus = status;
    if (!status && includeInactive === 'true') finalStatus = 'all';

    let finalIsFeatured: boolean | undefined = undefined;
    if (isFeatured === 'true') finalIsFeatured = true;
    if (isFeatured === 'false') finalIsFeatured = false;

    // Legacy exclude mapping overrides if specific isFeatured not set
    if (excludeFeatured === 'true' && finalIsFeatured === undefined) finalIsFeatured = false;

    let finalIsBanner: boolean | undefined = undefined;
    if (isBanner === 'true') finalIsBanner = true;
    if (isBanner === 'false') finalIsBanner = false;

    return this.eventsService.findAll(page, limit, finalStatus, finalIsFeatured, search, userId, finalIsBanner);
  }

  @Public()
  @Get('featured')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Listar eventos destacados' })
  featured(@GetUser('id') userId?: string) {
    return this.eventsService.findFeatured(userId);
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Buscar eventos por texto' })
  search(
    @Query('q') q: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.eventsService.search(q ?? '', page, limit);
  }

  @Public()
  @Get('category/:category')
  @ApiOperation({ summary: 'Eventos por categoría' })
  byCategory(
    @Param('category') category: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.eventsService.byCategory(category, page, limit);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('feed')
  @ApiOperation({ summary: 'Feed de eventos (míos + de usuarios que sigo)' })
  feed(
    @GetUser('id') userId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.eventsService.feed(userId, page, limit);
  }

  @Public()
  @Get('user/:userId')
  @ApiOperation({ summary: 'Listar eventos de un usuario (paginado)' })
  findByUser(
    @Param('userId') userId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.eventsService.findByUser(userId, page, limit);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Detalle de evento' })
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Get(':id/comments')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Listar comentarios de un evento' })
  async getComments(
    @Param('id') id: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @GetUser('id') userId?: string, // Optional to check isLiked
  ) {
    const result = await this.eventsService.getComments(id, page, limit);
    // Enrich with isLiked if userId is present
    if (userId) {
      result.data = result.data.map((c: any) => ({
        ...c,
        isLiked: c.likes?.some((l: any) => l.userId === userId),
        replies: c.replies?.map((r: any) => ({
          ...r,
          isLiked: r.likes?.some((l: any) => l.userId === userId)
        }))
      }));
    }
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post(':id/comments')
  @ApiOperation({ summary: 'Comentar un evento o responder' })
  addComment(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: { content: string, parentId?: string },
  ) {
    return this.eventsService.addComment(userId, id, dto?.content, dto?.parentId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Delete('comments/:commentId')
  @ApiOperation({ summary: 'Eliminar comentario' })
  deleteComment(
    @GetUser('id') userId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.eventsService.deleteComment(userId, commentId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Patch('comments/:commentId')
  @ApiOperation({ summary: 'Editar comentario' })
  editComment(
    @GetUser('id') userId: string,
    @Param('commentId') commentId: string,
    @Body() dto: { content: string },
  ) {
    return this.eventsService.editComment(userId, commentId, dto.content);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('comments/:commentId/like')
  @ApiOperation({ summary: 'Dar/Quitar like a comentario' })
  toggleCommentLike(
    @GetUser('id') userId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.eventsService.toggleCommentLike(userId, commentId);
  }

  @Public()
  @Get(':id/dates')
  @ApiOperation({ summary: 'Fechas de un evento' })
  getDates(@Param('id') id: string) {
    return this.eventsService.getDates(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('my')
  @ApiOperation({ summary: 'Listar mis eventos' })
  myEvents(@GetUser('id') userId: string) {
    return this.eventsService.myEvents(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar evento' })
  update(@GetUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(userId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Patch(':id/toggle-status')
  @ApiOperation({ summary: 'Activar/Desactivar evento' })
  toggleStatus(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.eventsService.toggleStatus(userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar evento' })
  remove(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.eventsService.remove(userId, id);
  }

  @Public()
  @Get('related/:eventId')
  @ApiOperation({ summary: 'Eventos relacionados por ID de evento' })
  async relatedByEvent(
    @Param('eventId') eventId: string,
    @Query('excludeFeatured') excludeFeatured?: string
  ) {
    return this.eventsService.relatedByEvent(eventId, excludeFeatured === 'true');
  }

  @Public()
  @Get('related/category/:category')
  @ApiOperation({ summary: 'Eventos relacionados por categoría' })
  relatedByCategory(
    @Param('category') category: string,
    @Query('excludeFeatured') excludeFeatured?: string
  ) {
    return this.eventsService.relatedByCategory(category, excludeFeatured === 'true');
  }

  @Public()
  @Get('stats/by-category')
  @ApiOperation({ summary: 'Estadísticas por categoría' })
  statsByCategory() {
    return this.eventsService.statsByCategory();
  }

  // Same detail without a date: the event page URL only carries the event id
  @Public()
  @Get('detail/:eventId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Detalle de evento con todas sus fechas próximas' })
  getEventDetail(@Param('eventId') eventId: string, @GetUser('id') userId?: string) {
    return this.eventsService.getEventDetailByDate(eventId, '', userId);
  }

  @Public()
  @Get('detail/:eventId/:dateId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Detalle de evento con fecha específica' })
  getEventDetailByDate(
    @Param('eventId') eventId: string,
    @Param('dateId') dateId: string,
    @GetUser('id') userId?: string,
  ) {
    return this.eventsService.getEventDetailByDate(eventId, dateId, userId);
  }

  @Public()
  @Get('public/search')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Búsqueda avanzada pública de eventos' })
  searchPublicEvents(
    @Query('categoria') categoria?: string,
    @Query('departamento') departamento?: string,
    @Query('provincia') provincia?: string,
    @Query('distrito') distrito?: string,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin') fechaFin?: string,
    @Query('busqueda') busqueda?: string,
    @Query('esGratis') esGratis?: boolean,
    @Query('enCurso') enCurso?: boolean,
    @Query('horaInicio') horaInicio?: string,
    @Query('horaFin') horaFin?: string,
    @Query('excludeFeatured') excludeFeatured?: string,
    @Query('expandDates') expandDates?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @GetUser('id') userId?: string,
  ) {
    return this.eventsService.searchPublicEvents({
      categoria,
      departamento,
      provincia,
      distrito,
      fechaInicio,
      fechaFin,
      busqueda,
      esGratis,
      enCurso,
      horaInicio,
      horaFin,
      excludeFeatured: excludeFeatured === 'true',
      expandDates: expandDates !== 'false',
      page,
      limit,
      userId,
    });
  }
}

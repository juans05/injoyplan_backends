import { Controller, Get, Post, Body, Param, Delete, UseGuards, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FriendshipsService } from './friendships.service';
import { CreateFriendshipDto } from './dto/create-friendship.dto';
import { InviteFriendDto } from './dto/invite-friend.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Friendships')
@Controller('friendships')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class FriendshipsController {
  constructor(private readonly friendshipsService: FriendshipsService) {}

  @Post('invite')
  @ApiOperation({ summary: 'Invitar por correo a alguien que aún no está en Injoyplan' })
  invite(@GetUser('id') userId: string, @Body() dto: InviteFriendDto) {
    return this.friendshipsService.invite(userId, dto);
  }

  @Post('request')
  @ApiOperation({ summary: 'Enviar solicitud de amistad' })
  request(@GetUser('id') userId: string, @Body() dto: CreateFriendshipDto) {
    return this.friendshipsService.request(userId, dto);
  }

  @Patch(':id/accept')
  @ApiOperation({ summary: 'Aceptar solicitud' })
  accept(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.friendshipsService.accept(userId, id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Rechazar solicitud' })
  reject(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.friendshipsService.reject(userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar amistad' })
  remove(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.friendshipsService.remove(userId, id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar amigos' })
  list(@GetUser('id') userId: string) {
    return this.friendshipsService.list(userId);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Solicitudes pendientes' })
  pending(@GetUser('id') userId: string) {
    return this.friendshipsService.pending(userId);
  }
}

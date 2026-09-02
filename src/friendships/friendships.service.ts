import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFriendshipDto } from './dto/create-friendship.dto';
import { InviteFriendDto } from './dto/invite-friend.dto';
import { EmailService } from '../auth/email.service';

@Injectable()
export class FriendshipsService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async invite(userId: string, dto: InviteFriendDto) {
    const inviter = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    const inviterName =
      [inviter?.profile?.firstName, inviter?.profile?.lastName].filter(Boolean).join(' ') ||
      inviter?.username ||
      'Un amigo de Injoyplan';

    await this.emailService.sendFriendInviteEmail(dto.email, inviterName);
    return { message: 'Invitación enviada' };
  }

  async request(userId: string, dto: CreateFriendshipDto) {
    if (userId === dto.friendId) throw new BadRequestException('No puedes enviarte solicitud a ti mismo');

    const existing = await this.prisma.friendship.findUnique({
      where: { userId_friendId: { userId, friendId: dto.friendId } },
    });
    if (existing) throw new BadRequestException('Solicitud ya enviada');

    return this.prisma.friendship.create({
      data: { userId, friendId: dto.friendId },
    });
  }

  async accept(userId: string, id: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id } });
    if (!friendship) throw new NotFoundException('Solicitud no encontrada');
    if (friendship.friendId !== userId) throw new ForbiddenException('No autorizado');

    return this.prisma.friendship.update({
      where: { id },
      data: { status: 'ACCEPTED' },
    });
  }

  async reject(userId: string, id: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id } });
    if (!friendship) throw new NotFoundException('Solicitud no encontrada');
    if (friendship.friendId !== userId) throw new ForbiddenException('No autorizado');

    await this.prisma.friendship.update({ where: { id }, data: { status: 'REJECTED' } });
    return { message: 'Solicitud rechazada' };
  }

  async remove(userId: string, id: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id } });
    if (!friendship) throw new NotFoundException('Relación no encontrada');
    if (friendship.userId !== userId && friendship.friendId !== userId)
      throw new ForbiddenException('No autorizado');

    await this.prisma.friendship.delete({ where: { id } });
    return { message: 'Amistad eliminada' };
  }

  async list(userId: string) {
    return this.prisma.friendship.findMany({
      where: { OR: [{ userId, status: 'ACCEPTED' }, { friendId: userId, status: 'ACCEPTED' }] },
      include: {
        user: { include: { profile: true } },
        friend: { include: { profile: true } },
      },
    });
  }

  async pending(userId: string) {
    return this.prisma.friendship.findMany({
      where: { friendId: userId, status: 'PENDING' },
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}

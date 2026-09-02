import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UploadService } from './upload.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
  ) { }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true,
            events: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getUserById(id: string, currentUserId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true,
            events: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Check if current user follows this user
    let isFollowing = false;
    if (currentUserId) {
      const follow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: id,
          },
        },
      });
      isFollowing = !!follow;
    }

    const { password, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      isFollowing,
    };
  }

  async searchUsers(currentUserId: string, query: string, page = 1, limit = 20) {
    if (!query || query.trim().length < 2) {
      return { data: [], total: 0, page, totalPages: 1 };
    }
    const skip = (page - 1) * limit;
    const where = {
      id: { not: currentUserId },
      OR: [
        { username: { contains: query, mode: 'insensitive' as const } },
        { profile: { firstName: { contains: query, mode: 'insensitive' as const } } },
        { profile: { lastName: { contains: query, mode: 'insensitive' as const } } },
      ],
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { profile: true },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const ids = users.map((u) => u.id);
    const friendships = ids.length
      ? await this.prisma.friendship.findMany({
          where: {
            OR: [
              { userId: currentUserId, friendId: { in: ids } },
              { friendId: currentUserId, userId: { in: ids } },
            ],
          },
        })
      : [];

    const data = users.map((u) => {
      const { password, verificationToken, resetToken, resetTokenExpiry, ...rest } = u;
      const fr = friendships.find((f) => f.userId === u.id || f.friendId === u.id);
      let friendshipStatus: 'NONE' | 'PENDING_SENT' | 'PENDING_RECEIVED' | 'FRIENDS' = 'NONE';
      if (fr) {
        if (fr.status === 'ACCEPTED') friendshipStatus = 'FRIENDS';
        else if (fr.status === 'PENDING') {
          friendshipStatus = fr.userId === currentUserId ? 'PENDING_SENT' : 'PENDING_RECEIVED';
        }
      }
      return { ...rest, friendshipId: fr?.id, friendshipStatus };
    });

    return { data, total, page, totalPages: Math.ceil(total / limit) || 1 };
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const { username, email, password, currentPassword, becomeCompany, birthDate, ...profileData } = updateProfileDto;

    // 1. Update User entity if needed
    if (username || email || password || becomeCompany) {
      const bcrypt = await import('bcrypt');

      // Changing email/password requires proving you know the current password
      if (email || password) {
        if (!currentPassword) {
          throw new BadRequestException('Debes indicar tu contraseña actual para cambiar el email o la contraseña');
        }
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
          throw new UnauthorizedException('Contraseña actual incorrecta');
        }
      }

      const updateData: any = {};
      if (username) updateData.username = username;
      if (email) updateData.email = email;
      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      if (becomeCompany) {
        const { ruc, razonSocial, dni, fichaRucUrl } = profileData as any;
        if (!ruc || !razonSocial || !dni || !fichaRucUrl) {
          throw new BadRequestException(
            'Para convertirte en empresa debes completar RUC, Razón Social, DNI y adjuntar la Ficha RUC',
          );
        }
        updateData.userType = 'COMPANY';
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
    }

    // 2. Prepare Profile data
    const finalProfileData: any = { ...profileData };
    if (birthDate) {
      finalProfileData.birthDate = new Date(birthDate);
    }

    // 3. Update Profile entity
    const profile = await this.prisma.profile.update({
      where: { userId },
      data: finalProfileData,
    });

    return profile;
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const imageUrl = await this.uploadService.uploadImage(file);

    const profile = await this.prisma.profile.update({
      where: { userId },
      data: { avatar: imageUrl },
    });

    return { avatar: profile.avatar };
  }

  async uploadCoverImage(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const imageUrl = await this.uploadService.uploadImage(file);

    const profile = await this.prisma.profile.update({
      where: { userId },
      data: { coverImage: imageUrl },
    });

    return { coverImage: profile.coverImage };
  }

  async uploadCompanyDocument(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('La Ficha RUC debe ser un PDF o una imagen (JPG, PNG, WEBP)');
    }

    const fichaRucUrl = await this.uploadService.uploadDocument(file);

    const profile = await this.prisma.profile.update({
      where: { userId },
      data: { fichaRucUrl },
    });

    return { fichaRucUrl: profile.fichaRucUrl };
  }

  async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('No puedes seguirte a ti mismo');
    }

    const existingFollow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });

    if (existingFollow) {
      throw new BadRequestException('Ya sigues a este usuario');
    }

    const follow = await this.prisma.follow.create({
      data: {
        followerId,
        followingId,
      },
    });

    return { message: 'Usuario seguido exitosamente', follow };
  }

  async unfollowUser(followerId: string, followingId: string) {
    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });

    if (!follow) {
      throw new NotFoundException('No sigues a este usuario');
    }

    await this.prisma.follow.delete({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });

    return { message: 'Dejaste de seguir al usuario' };
  }

  async getFollowers(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [followers, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followingId: userId },
        include: {
          follower: {
            include: {
              profile: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({
        where: { followingId: userId },
      }),
    ]);

    return {
      data: followers.map((f) => {
        const { password, ...user } = f.follower;
        return user;
      }),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getFollowing(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [following, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId },
        include: {
          following: {
            include: {
              profile: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({
        where: { followerId: userId },
      }),
    ]);

    return {
      data: following.map((f) => {
        const { password, ...user } = f.following;
        return user;
      }),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}

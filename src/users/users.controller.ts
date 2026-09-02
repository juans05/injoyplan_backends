import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiBearerAuth('JWT-auth')
  @Get('profile/@me')
  @ApiOperation({ summary: 'Obtener mi perfil' })
  getMyProfile(@GetUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @ApiBearerAuth('JWT-auth')
  @Get('search')
  @ApiOperation({ summary: 'Buscar usuarios por nombre de usuario o nombre' })
  searchUsers(
    @GetUser('id') userId: string,
    @Query('q') q: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.usersService.searchUsers(userId, q || '', page, limit);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Obtener perfil de usuario por ID' })
  getUserById(@Param('id') id: string, @GetUser('id') currentUserId?: string) {
    return this.usersService.getUserById(id, currentUserId);
  }

  @ApiBearerAuth('JWT-auth')
  @Patch('profile')
  @ApiOperation({ summary: 'Actualizar mi perfil' })
  updateProfile(
    @GetUser('id') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, updateProfileDto);
  }

  @ApiBearerAuth('JWT-auth')
  @Post('profile/avatar')
  @ApiOperation({ summary: 'Subir foto de perfil' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(
    @GetUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadAvatar(userId, file);
  }

  @ApiBearerAuth('JWT-auth')
  @Post('profile/cover')
  @ApiOperation({ summary: 'Subir imagen de portada' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadCover(
    @GetUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadCoverImage(userId, file);
  }

  @ApiBearerAuth('JWT-auth')
  @Post('profile/company-document')
  @ApiOperation({ summary: 'Subir Ficha RUC (para convertirse en empresa)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadCompanyDocument(
    @GetUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadCompanyDocument(userId, file);
  }

  @ApiBearerAuth('JWT-auth')
  @Post(':id/follow')
  @ApiOperation({ summary: 'Seguir a un usuario' })
  followUser(@GetUser('id') followerId: string, @Param('id') followingId: string) {
    return this.usersService.followUser(followerId, followingId);
  }

  @ApiBearerAuth('JWT-auth')
  @Delete(':id/unfollow')
  @ApiOperation({ summary: 'Dejar de seguir a un usuario' })
  unfollowUser(
    @GetUser('id') followerId: string,
    @Param('id') followingId: string,
  ) {
    return this.usersService.unfollowUser(followerId, followingId);
  }

  @Public()
  @Get(':id/followers')
  @ApiOperation({ summary: 'Obtener seguidores de un usuario' })
  getFollowers(
    @Param('id') userId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.usersService.getFollowers(userId, page, limit);
  }

  @Public()
  @Get(':id/following')
  @ApiOperation({ summary: 'Obtener usuarios seguidos' })
  getFollowing(
    @Param('id') userId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.usersService.getFollowing(userId, page, limit);
  }
}

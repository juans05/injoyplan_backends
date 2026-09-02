import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/forgot-password.dto';
import { EmailService } from './email.service';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) { }

  async register(registerDto: RegisterDto) {
    const {
      email,
      password,
      userType = 'NORMAL',
      nombre,
      apellido,
      genero,
      f_nacimiento,
      imagenPerfil
    } = registerDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      if (existingUser.isVerified) {
        throw new ConflictException('El email ya está registrado');
      } else {
        // User exists but is not verified. Resend verification code.
        const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();

        // Update user with new token
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { verificationToken }
        });

        // Send verification email
        try {
          await this.emailService.sendVerificationEmail(email, verificationToken);
        } catch (emailError) {
          console.error('Failed to send verification email:', emailError);
        }

        return {
          message: 'Usuario registrado exitosamente. Por favor verifica tu email.',
          userId: existingUser.id,
          email: existingUser.email
        };
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate 6-digit verification code
    const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();

    // Create user with profile
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        userType: userType as any, // Cast to enum
        verificationToken,
        profile: {
          create: {
            firstName: nombre || null,
            lastName: apellido || null,
            avatar: imagenPerfil || null,
            description: genero ? `Género: ${genero}` : null, // Store genero in description for now
            // Note: f_nacimiento (birth date) could be stored in a custom field if schema allows
          },
        },
      },
      include: {
        profile: true,
      },
    });

    // Send verification email (don't fail registration if email fails)
    try {
      await this.emailService.sendVerificationEmail(email, verificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Continue with registration success - email can be resent later
    }

    return {
      message: 'Usuario registrado exitosamente. Por favor verifica tu email.',
      userId: user.id,
      email: user.email // Return email for frontend step 2
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Debes verificar tu email antes de iniciar sesión');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        userType: user.userType,
        isVerified: user.isVerified,
        profile: user.profile,
      },
      ...tokens,
    };
  }

  async verifyCode(email: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    if (user.isVerified) {
      // If already verified, just return tokens (login)
      return this.generateTokens(user.id, user.email);
    }

    if (user.verificationToken !== code) {
      throw new BadRequestException('Código de verificación inválido');
    }

    // Verify user
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
      },
    });

    // Auto-login: return tokens
    return this.generateTokens(user.id, user.email);
  }

  async verifyEmail(token: string) {
    // Keep legacy support or just reuse logic
    const user = await this.prisma.user.findFirst({
      where: { verificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Token de verificación inválido');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
      },
    });

    return { message: 'Email verificado exitosamente' };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if user exists
      return {
        message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña',
      };
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    // Send reset email
    await this.emailService.sendPasswordResetEmail(email, resetToken);

    return {
      message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;

    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gte: new Date(),
        },
      },
    });

    if (!user) {
      throw new BadRequestException('Token inválido o expirado');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    return { message: 'Contraseña restablecida exitosamente' };
  }

  async refreshToken(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.generateTokens(user.id, user.email);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRES_IN'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN'),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}

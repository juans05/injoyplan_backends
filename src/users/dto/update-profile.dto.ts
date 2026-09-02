import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, IsEmail, IsStrongPassword, Matches, IsBoolean } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  firstName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  lastName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(10)
  gender?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  birthDate?: string; // string format YYYY-MM-DD

  // User fields
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 0,
  })
  @IsOptional()
  password?: string;

  // Required to confirm identity when changing email or password
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  currentPassword?: string;

  // Company data — set becomeCompany=true together with these to upgrade a NORMAL user to COMPANY
  @ApiProperty({ required: false, description: 'Upgrade this user to userType COMPANY' })
  @IsBoolean()
  @IsOptional()
  becomeCompany?: boolean;

  @ApiProperty({ required: false, example: '20123456789' })
  @IsString()
  @Matches(/^\d{11}$/, { message: 'El RUC debe tener 11 dígitos' })
  @IsOptional()
  ruc?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  razonSocial?: string;

  @ApiProperty({ required: false, example: '12345678' })
  @IsString()
  @Matches(/^\d{8}$/, { message: 'El DNI debe tener 8 dígitos' })
  @IsOptional()
  dni?: string;

  @ApiProperty({ required: false, description: 'URL de la ficha RUC subida previamente vía /users/profile/company-document' })
  @IsString()
  @IsOptional()
  fichaRucUrl?: string;
}

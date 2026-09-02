import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class InviteFriendDto {
  @ApiProperty({ example: 'amigo@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

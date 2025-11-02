import { IsString, IsEmail, IsUUID, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000001', description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ example: 'firebase_uid_123', description: 'Firebase user ID' })
  @IsString()
  firebaseUid: string;

  @ApiProperty({ example: 'user@example.com', description: 'User email' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'agent', enum: ['admin', 'agent', 'viewer'], description: 'User role' })
  @IsString()
  @IsIn(['admin', 'agent', 'viewer'])
  role: string;
}

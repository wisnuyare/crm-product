import { IsString, IsUUID, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOutletDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000001', description: 'Tenant ID' })
  @IsUUID('all')
  tenantId: string;

  @ApiProperty({ example: 'Downtown Store', description: 'Outlet name' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: '+628123456789', description: 'WhatsApp phone number' })
  @IsString()
  @MinLength(10)
  @MaxLength(15)
  wabaPhoneNumber: string;

  @ApiProperty({
    example: 'phone_number_id_123',
    description: 'WhatsApp Business API phone number ID',
  })
  @IsString()
  wabaPhoneNumberId: string;

  @ApiProperty({
    example: 'business_account_id_123',
    description: 'WhatsApp Business API account ID',
  })
  @IsString()
  wabaBusinessAccountId: string;

  @ApiProperty({
    example: 'EAAxxxxx',
    description: 'WhatsApp Business API access token',
  })
  @IsString()
  wabaAccessToken: string;
}

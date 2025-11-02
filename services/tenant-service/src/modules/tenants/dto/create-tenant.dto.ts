import { IsString, IsEmail, IsOptional, IsObject, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Corporation', description: 'Tenant name' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'acme-corp', description: 'Unique slug for tenant' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug: string;

  @ApiPropertyOptional({ example: 'admin@acme.com', description: 'Contact email' })
  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @ApiPropertyOptional({
    example: { tone: 'professional', language: 'en' },
    description: 'LLM configuration for tone and behavior',
  })
  @IsObject()
  @IsOptional()
  llmTone?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Firebase tenant ID' })
  @IsString()
  @IsOptional()
  firebaseTenantId?: string;
}

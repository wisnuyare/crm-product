import { PartialType } from '@nestjs/swagger';
import { CreateTenantDto } from './create-tenant.dto';
import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  @ApiPropertyOptional({ example: 'active', enum: ['active', 'suspended', 'inactive'] })
  @IsString()
  @IsOptional()
  @IsIn(['active', 'suspended', 'inactive'])
  status?: string;
}

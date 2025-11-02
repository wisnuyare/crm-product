import { PartialType } from '@nestjs/swagger';
import { CreateOutletDto } from './create-outlet.dto';
import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOutletDto extends PartialType(CreateOutletDto) {
  @ApiPropertyOptional({ example: 'active', enum: ['active', 'inactive'] })
  @IsString()
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}

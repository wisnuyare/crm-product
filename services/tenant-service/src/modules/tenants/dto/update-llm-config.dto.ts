import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateLlmConfigDto {
  @ApiProperty({ example: 'professional', description: 'The tone of the LLM' })
  @IsString()
  @IsOptional()
  @IsIn(['professional', 'friendly', 'formal'])
  tone?: string;

  @ApiProperty({ example: 'en', description: 'The language of the LLM' })
  @IsString()
  @IsOptional()
  language?: string;
}

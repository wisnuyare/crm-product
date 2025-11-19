import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ description: 'Product name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Product description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Product price' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ description: 'Stock quantity' })
  @IsNumber()
  @Min(0)
  stock_quantity: number;

  @ApiPropertyOptional({ description: 'Low stock threshold', default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  low_stock_threshold?: number;

  @ApiPropertyOptional({ description: 'Product category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Product SKU' })
  @IsOptional()
  @IsString()
  sku?: string;
}

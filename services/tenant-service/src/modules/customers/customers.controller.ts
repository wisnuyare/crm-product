import { Controller, Get, Post, Put, Param, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { CustomersService } from './customers.service';
import { Public } from '../../firebase/decorators';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  customer_phone: string;

  @IsString()
  @IsOptional()
  customer_name?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateCustomerDto {
  @IsString()
  @IsOptional()
  customer_name?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Public()
  @Get('by-phone/:phone')
  @ApiOperation({ summary: 'Get customer by phone number (internal API)' })
  @ApiResponse({ status: 200, description: 'Customer found' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async findByPhone(
    @Param('phone') phone: string,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return await this.customersService.findByPhone(tenantId, phone);
  }

  @Public()
  @Post()
  @ApiOperation({ summary: 'Create or update customer (internal API)' })
  @ApiResponse({ status: 201, description: 'Customer created/updated' })
  async createOrUpdate(
    @Body() createCustomerDto: CreateCustomerDto,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return await this.customersService.createOrUpdate(tenantId, createCustomerDto);
  }

  @Public()
  @Put(':phone')
  @ApiOperation({ summary: 'Update customer information (internal API)' })
  @ApiResponse({ status: 200, description: 'Customer updated' })
  async update(
    @Param('phone') phone: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-internal-api-key') internalKey?: string,
  ) {
    if (!this.isInternalRequest(internalKey)) {
      throw new HttpException('Unauthorized - Invalid API key', HttpStatus.UNAUTHORIZED);
    }

    return await this.customersService.update(tenantId, phone, updateCustomerDto);
  }

  private isInternalRequest(apiKey?: string): boolean {
    const internalApiKey = process.env.INTERNAL_API_KEY || 'dev-internal-key-12345';
    return apiKey === internalApiKey;
  }
}

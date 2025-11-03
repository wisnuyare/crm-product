import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from '../../types/tenant.entity';
import { Roles, Public, TenantId } from '../../firebase/decorators';

import { UpdateLlmConfigDto } from './dto/update-llm-config.dto';

@ApiTags('tenants')
@Controller('tenants')
@ApiBearerAuth()
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created successfully', type: Tenant })
  @ApiResponse({ status: 409, description: 'Tenant with slug already exists' })
  async create(@Body() createTenantDto: CreateTenantDto): Promise<Tenant> {
    return await this.tenantsService.create(createTenantDto);
  }

  @Get()
  @Roles('admin', 'agent')
  @ApiOperation({ summary: 'Get current tenant info' })
  @ApiResponse({ status: 200, description: 'Current tenant info', type: [Tenant] })
  async findAll(@TenantId() tenantId: string): Promise<Tenant[]> {
    return await this.tenantsService.findAll(tenantId);
  }

  @Get(':id')
  @Roles('admin', 'agent')
  @ApiOperation({ summary: 'Get tenant by ID' })
  @ApiResponse({ status: 200, description: 'Tenant found', type: Tenant })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async findOne(@Param('id') id: string, @TenantId() tenantId: string): Promise<Tenant> {
    return await this.tenantsService.findOne(id, tenantId);
  }

  @Get('slug/:slug')
  @Public()
  @ApiOperation({ summary: 'Get tenant by slug (public)' })
  @ApiResponse({ status: 200, description: 'Tenant found', type: Tenant })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async findBySlug(@Param('slug') slug: string): Promise<Tenant> {
    return await this.tenantsService.findBySlug(slug);
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update tenant' })
  @ApiResponse({ status: 200, description: 'Tenant updated successfully', type: Tenant })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async update(
    @Param('id') id: string,
    @Body() updateTenantDto: UpdateTenantDto,
    @TenantId() tenantId: string,
  ): Promise<Tenant> {
    return await this.tenantsService.update(id, updateTenantDto, tenantId);
  }

  @Put(':id/llm-config')
  @Roles('admin')
  @ApiOperation({ summary: 'Update tenant LLM configuration' })
  @ApiResponse({ status: 200, description: 'LLM config updated successfully', type: Tenant })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async updateLlmConfig(
    @Param('id') id: string,
    @Body() llmConfigDto: UpdateLlmConfigDto,
    @TenantId() tenantId: string,
  ): Promise<Tenant> {
    return await this.tenantsService.updateLlmConfig(id, llmConfigDto, tenantId);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete tenant' })
  @ApiResponse({ status: 204, description: 'Tenant deleted successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async remove(@Param('id') id: string, @TenantId() tenantId: string): Promise<void> {
    return await this.tenantsService.remove(id, tenantId);
  }
}

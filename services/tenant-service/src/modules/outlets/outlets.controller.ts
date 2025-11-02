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
import { OutletsService } from './outlets.service';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { Outlet } from '../../types/tenant.interface';
import { Roles } from '../../firebase/decorators';

@ApiTags('outlets')
@Controller('outlets')
@ApiBearerAuth()
export class OutletsController {
  constructor(private readonly outletsService: OutletsService) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new outlet' })
  @ApiResponse({ status: 201, description: 'Outlet created successfully', type: Outlet })
  @ApiResponse({ status: 409, description: 'Outlet with phone number already exists' })
  async create(@Body() createOutletDto: CreateOutletDto): Promise<Outlet> {
    return await this.outletsService.create(createOutletDto);
  }

  @Get()
  @Roles('admin', 'agent')
  @ApiOperation({ summary: 'Get all outlets' })
  @ApiResponse({ status: 200, description: 'List of all outlets', type: [Outlet] })
  async findAll(): Promise<Outlet[]> {
    return await this.outletsService.findAll();
  }

  @Get('tenant/:tenantId')
  @Roles('admin', 'agent')
  @ApiOperation({ summary: 'Get all outlets for a tenant' })
  @ApiResponse({ status: 200, description: 'List of tenant outlets', type: [Outlet] })
  async findByTenant(@Param('tenantId') tenantId: string): Promise<Outlet[]> {
    return await this.outletsService.findByTenant(tenantId);
  }

  @Get(':id')
  @Roles('admin', 'agent')
  @ApiOperation({ summary: 'Get outlet by ID' })
  @ApiResponse({ status: 200, description: 'Outlet found', type: Outlet })
  @ApiResponse({ status: 404, description: 'Outlet not found' })
  async findOne(@Param('id') id: string): Promise<Outlet> {
    return await this.outletsService.findOne(id);
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update outlet' })
  @ApiResponse({ status: 200, description: 'Outlet updated successfully', type: Outlet })
  @ApiResponse({ status: 404, description: 'Outlet not found' })
  async update(@Param('id') id: string, @Body() updateOutletDto: UpdateOutletDto): Promise<Outlet> {
    return await this.outletsService.update(id, updateOutletDto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete outlet' })
  @ApiResponse({ status: 204, description: 'Outlet deleted successfully' })
  @ApiResponse({ status: 404, description: 'Outlet not found' })
  async remove(@Param('id') id: string): Promise<void> {
    return await this.outletsService.remove(id);
  }
}

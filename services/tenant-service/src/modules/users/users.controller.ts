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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from '../../types/tenant.entity';
import { Roles, TenantId } from '../../firebase/decorators';

@ApiTags('users')
@Controller('users')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully', type: User })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return await this.usersService.create(createUserDto);
  }

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Get all users for current tenant' })
  @ApiResponse({ status: 200, description: 'List of tenant users', type: [User] })
  async findAll(@TenantId() tenantId: string): Promise<User[]> {
    return await this.usersService.findAll(tenantId);
  }

  @Get('tenant/:tenantId')
  @Roles('admin', 'agent')
  @ApiOperation({ summary: 'Get all users for a tenant' })
  @ApiResponse({ status: 200, description: 'List of tenant users', type: [User] })
  async findByTenant(@Param('tenantId') tenantId: string): Promise<User[]> {
    return await this.usersService.findByTenant(tenantId);
  }

  @Get(':id')
  @Roles('admin', 'agent')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User found', type: User })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string, @TenantId() tenantId: string): Promise<User> {
    return await this.usersService.findOne(id, tenantId);
  }

  @Put(':id/role')
  @Roles('admin')
  @ApiOperation({ summary: 'Update user role' })
  @ApiResponse({ status: 200, description: 'Role updated successfully', type: User })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateRole(
    @Param('id') id: string,
    @Body('role') role: string,
    @TenantId() tenantId: string,
  ): Promise<User> {
    return await this.usersService.updateRole(id, role, tenantId);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete user' })
  @ApiResponse({ status: 204, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async remove(@Param('id') id: string, @TenantId() tenantId: string): Promise<void> {
    return await this.usersService.remove(id, tenantId);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { QuotaService, QuotaStatus, SubscriptionTier, UsageRecord } from './quota.service';
import { Roles, TenantId } from '../../firebase/decorators';

@ApiTags('quota')
@Controller('quota')
@ApiBearerAuth()
export class QuotaController {
  constructor(private readonly quotaService: QuotaService) {}

  @Get('tiers')
  @Roles('admin', 'agent', 'viewer')
  @ApiOperation({ summary: 'Get all available subscription tiers' })
  @ApiResponse({ status: 200, description: 'List of subscription tiers' })
  async getTiers(): Promise<SubscriptionTier[]> {
    return this.quotaService.getAllTiers();
  }

  @Get('tiers/:tier')
  @Roles('admin', 'agent', 'viewer')
  @ApiOperation({ summary: 'Get subscription tier details' })
  @ApiResponse({ status: 200, description: 'Tier details' })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  async getTierDetails(@Param('tier') tier: string): Promise<SubscriptionTier> {
    return this.quotaService.getTierDefinition(tier);
  }

  @Get('status')
  @Roles('admin', 'agent', 'viewer')
  @ApiOperation({ summary: 'Get current quota status for authenticated tenant' })
  @ApiResponse({ status: 200, description: 'Current quota status' })
  @ApiResponse({ status: 404, description: 'No active subscription found' })
  async getQuotaStatus(@TenantId() tenantId: string): Promise<QuotaStatus> {
    return await this.quotaService.getQuotaStatus(tenantId);
  }

  @Get('tenants/:tenantId/status')
  @Roles('admin')
  @ApiOperation({ summary: 'Get quota status for any tenant (admin only)' })
  @ApiResponse({ status: 200, description: 'Quota status' })
  @ApiResponse({ status: 404, description: 'Tenant or subscription not found' })
  async getTenantQuotaStatus(@Param('tenantId') tenantId: string): Promise<QuotaStatus> {
    return await this.quotaService.getQuotaStatus(tenantId);
  }

  @Post('usage/messages')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record message usage (admin only)' })
  @ApiResponse({ status: 200, description: 'Usage recorded successfully' })
  async recordMessageUsage(
    @TenantId() tenantId: string,
    @Body('count') count: number = 1,
  ): Promise<{ success: boolean; message: string }> {
    await this.quotaService.recordMessageUsage(tenantId, count);
    return {
      success: true,
      message: `Recorded ${count} message(s)`,
    };
  }

  @Get('usage/history')
  @Roles('admin', 'agent')
  @ApiOperation({ summary: 'Get usage history for authenticated tenant' })
  @ApiQuery({ name: 'type', required: false, enum: ['messages', 'api_calls', 'storage_mb'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Usage history' })
  async getUsageHistory(
    @TenantId() tenantId: string,
    @Query('type') type?: 'messages' | 'api_calls' | 'storage_mb',
    @Query('limit') limit?: number,
  ): Promise<UsageRecord[]> {
    return await this.quotaService.getUsageHistory(tenantId, type, limit ? +limit : 12);
  }

  @Get('tenants/:tenantId/usage/history')
  @Roles('admin')
  @ApiOperation({ summary: 'Get usage history for any tenant (admin only)' })
  @ApiQuery({ name: 'type', required: false, enum: ['messages', 'api_calls', 'storage_mb'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Usage history' })
  async getTenantUsageHistory(
    @Param('tenantId') tenantId: string,
    @Query('type') type?: 'messages' | 'api_calls' | 'storage_mb',
    @Query('limit') limit?: number,
  ): Promise<UsageRecord[]> {
    return await this.quotaService.getUsageHistory(tenantId, type, limit ? +limit : 12);
  }

  @Post('check/message')
  @Roles('admin', 'agent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if tenant can send a message' })
  @ApiResponse({ status: 200, description: 'Quota check passed' })
  @ApiResponse({ status: 403, description: 'Quota exceeded' })
  async checkMessageQuota(
    @TenantId() tenantId: string,
  ): Promise<{ canSend: boolean; message: string }> {
    try {
      await this.quotaService.checkMessageQuota(tenantId);
      return {
        canSend: true,
        message: 'Quota check passed',
      };
    } catch (error) {
      throw error;
    }
  }

  @Post('check/outlet')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if tenant can create an outlet' })
  @ApiResponse({ status: 200, description: 'Quota check passed' })
  @ApiResponse({ status: 403, description: 'Outlet limit reached' })
  async checkOutletLimit(
    @TenantId() tenantId: string,
  ): Promise<{ canCreate: boolean; message: string }> {
    try {
      await this.quotaService.checkOutletLimit(tenantId);
      return {
        canCreate: true,
        message: 'Quota check passed',
      };
    } catch (error) {
      throw error;
    }
  }

  @Post('check/storage')
  @Roles('admin', 'agent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if tenant can upload a document' })
  @ApiResponse({ status: 200, description: 'Storage quota check passed' })
  @ApiResponse({ status: 403, description: 'Storage quota exceeded' })
  async checkStorageQuota(
    @TenantId() tenantId: string,
    @Body('fileSizeBytes') fileSizeBytes: number,
  ): Promise<{ canUpload: boolean; message: string }> {
    try {
      await this.quotaService.checkStorageQuota(tenantId, fileSizeBytes);
      return {
        canUpload: true,
        message: 'Storage quota check passed',
      };
    } catch (error) {
      throw error;
    }
  }
}

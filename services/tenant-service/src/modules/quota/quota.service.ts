import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ConfigService } from '@nestjs/config';

export interface SubscriptionTier {
  name: string;
  messageQuota: number;
  outletLimit: number;
  knowledgeBaseLimit: number;
  storageLimitMB: number;
  monthlyPrice: number;
  overageRate: number;
}

export interface QuotaStatus {
  tenantId: string;
  subscription: {
    tier: string;
    messageQuota: number;
    outletLimit: number;
    knowledgeBaseLimit: number;
    storageLimitMB: number;
  };
  usage: {
    messages: number;
    outlets: number;
    knowledgeBases: number;
    storageMB: number;
  };
  percentages: {
    messages: number;
    outlets: number;
    knowledgeBases: number;
    storage: number;
  };
  warnings: string[];
  isOverLimit: boolean;
  canSendMessage: boolean;
  canCreateOutlet: boolean;
  canUploadDocument: boolean;
}

export interface UsageRecord {
  tenantId: string;
  usageType: 'messages' | 'api_calls' | 'storage_mb';
  count: number;
  periodStart: Date;
  periodEnd: Date;
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  // Subscription tier definitions
  private readonly TIERS: Record<string, SubscriptionTier> = {
    starter: {
      name: 'Starter',
      messageQuota: 500,
      outletLimit: 1,
      knowledgeBaseLimit: 1,
      storageLimitMB: 50,
      monthlyPrice: 99.0,
      overageRate: 0.1,
    },
    growth: {
      name: 'Growth',
      messageQuota: 2000,
      outletLimit: 3,
      knowledgeBaseLimit: 3,
      storageLimitMB: 200,
      monthlyPrice: 299.0,
      overageRate: 0.08,
    },
    enterprise: {
      name: 'Enterprise',
      messageQuota: 10000,
      outletLimit: 10,
      knowledgeBaseLimit: -1, // unlimited
      storageLimitMB: 1024,
      monthlyPrice: 799.0,
      overageRate: 0.05,
    },
  };

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Get subscription tier definition
   */
  getTierDefinition(tier: string): SubscriptionTier {
    const tierDef = this.TIERS[tier.toLowerCase()];
    if (!tierDef) {
      throw new NotFoundException(`Subscription tier '${tier}' not found`);
    }
    return tierDef;
  }

  /**
   * Get all available subscription tiers
   */
  getAllTiers(): SubscriptionTier[] {
    return Object.values(this.TIERS);
  }

  /**
   * Get current quota status for a tenant
   */
  async getQuotaStatus(tenantId: string): Promise<QuotaStatus> {
    // Get subscription
    const subscription = await this.db.queryOne<any>(
      'SELECT * FROM subscriptions WHERE tenant_id = $1 AND status = $2',
      [tenantId, 'active'],
    );

    if (!subscription) {
      throw new NotFoundException(`No active subscription found for tenant ${tenantId}`);
    }

    // Get current period (monthly)
    const periodStart = new Date();
    periodStart.setDate(1); // First day of current month
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1); // First day of next month

    // Get message usage for current period
    const messageUsage = await this.db.queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(count), 0) as total
       FROM usage_records
       WHERE tenant_id = $1
       AND usage_type = 'messages'
       AND period_start >= $2
       AND period_end <= $3`,
      [tenantId, periodStart, periodEnd],
    );

    // Get outlet count
    const outletCount = await this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM outlets WHERE tenant_id = $1 AND status = $2',
      [tenantId, 'active'],
    );

    // Get knowledge base count
    const kbCount = await this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM knowledge_bases WHERE tenant_id = $1 AND status = $2',
      [tenantId, 'active'],
    );

    // Get storage usage (sum of all document sizes)
    const storageUsage = await this.db.queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(file_size_bytes), 0) / (1024.0 * 1024.0) as total
       FROM documents
       WHERE tenant_id = $1`,
      [tenantId],
    );

    const usage = {
      messages: messageUsage?.total || 0,
      outlets: outletCount?.count || 0,
      knowledgeBases: kbCount?.count || 0,
      storageMB: Math.ceil(storageUsage?.total || 0),
    };

    const quotaInfo = {
      messageQuota: subscription.message_quota,
      outletLimit: subscription.outlet_limit,
      knowledgeBaseLimit: subscription.knowledge_base_limit,
      storageLimitMB: subscription.storage_limit_mb,
    };

    // Calculate percentages
    const percentages = {
      messages: (usage.messages / quotaInfo.messageQuota) * 100,
      outlets: (usage.outlets / quotaInfo.outletLimit) * 100,
      knowledgeBases:
        quotaInfo.knowledgeBaseLimit === -1
          ? 0
          : (usage.knowledgeBases / quotaInfo.knowledgeBaseLimit) * 100,
      storage: (usage.storageMB / quotaInfo.storageLimitMB) * 100,
    };

    // Generate warnings
    const warnings: string[] = [];
    if (percentages.messages >= 80) {
      warnings.push(`Message quota at ${percentages.messages.toFixed(1)}%`);
    }
    if (percentages.outlets >= 80) {
      warnings.push(`Outlet limit at ${percentages.outlets.toFixed(1)}%`);
    }
    if (percentages.storage >= 80) {
      warnings.push(`Storage usage at ${percentages.storage.toFixed(1)}%`);
    }

    // Check if over limit (105% hard limit for messages)
    const isOverLimit = percentages.messages > 105;

    return {
      tenantId,
      subscription: {
        tier: subscription.tier,
        ...quotaInfo,
      },
      usage,
      percentages,
      warnings,
      isOverLimit,
      canSendMessage: percentages.messages < 105,
      canCreateOutlet: usage.outlets < quotaInfo.outletLimit,
      canUploadDocument: percentages.storage < 100,
    };
  }

  /**
   * Check if tenant can send a message
   * Throws ForbiddenException if over quota
   */
  async checkMessageQuota(tenantId: string): Promise<void> {
    const status = await this.getQuotaStatus(tenantId);

    if (!status.canSendMessage) {
      this.logger.warn(`Tenant ${tenantId} is over message quota (${status.percentages.messages}%)`);
      throw new ForbiddenException(
        'Message quota exceeded. Please upgrade your subscription or add deposit.',
      );
    }

    // Warn at thresholds
    if (status.percentages.messages >= 90) {
      this.logger.warn(
        `Tenant ${tenantId} approaching message quota limit: ${status.percentages.messages.toFixed(1)}%`,
      );
    }
  }

  /**
   * Check if tenant can create an outlet
   */
  async checkOutletLimit(tenantId: string): Promise<void> {
    const status = await this.getQuotaStatus(tenantId);

    if (!status.canCreateOutlet) {
      throw new ForbiddenException(
        `Outlet limit reached (${status.usage.outlets}/${status.subscription.outletLimit}). Please upgrade your subscription.`,
      );
    }
  }

  /**
   * Check if tenant can upload a document
   */
  async checkStorageQuota(tenantId: string, fileSizeBytes: number): Promise<void> {
    const status = await this.getQuotaStatus(tenantId);
    const fileSizeMB = fileSizeBytes / (1024 * 1024);
    const projectedUsage = status.usage.storageMB + fileSizeMB;
    const projectedPercentage = (projectedUsage / status.subscription.storageLimitMB) * 100;

    if (projectedPercentage > 100) {
      throw new ForbiddenException(
        `Storage quota exceeded. Current: ${status.usage.storageMB}MB, Limit: ${status.subscription.storageLimitMB}MB`,
      );
    }
  }

  /**
   * Record message usage
   */
  async recordMessageUsage(tenantId: string, count: number = 1): Promise<void> {
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Insert or update usage record for current period
    await this.db.query(
      `INSERT INTO usage_records (tenant_id, usage_type, count, period_start, period_end)
       VALUES ($1, 'messages', $2, $3, $4)
       ON CONFLICT (tenant_id, usage_type, period_start, period_end)
       DO UPDATE SET count = usage_records.count + $2`,
      [tenantId, count, periodStart, periodEnd],
    );

    this.logger.debug(`Recorded ${count} message(s) for tenant ${tenantId}`);
  }

  /**
   * Record storage usage
   */
  async recordStorageUsage(tenantId: string, sizeMB: number): Promise<void> {
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await this.db.query(
      `INSERT INTO usage_records (tenant_id, usage_type, count, period_start, period_end)
       VALUES ($1, 'storage_mb', $2, $3, $4)
       ON CONFLICT (tenant_id, usage_type, period_start, period_end)
       DO UPDATE SET count = $2`,
      [tenantId, Math.ceil(sizeMB), periodStart, periodEnd],
    );

    this.logger.debug(`Recorded ${sizeMB}MB storage for tenant ${tenantId}`);
  }

  /**
   * Get usage history for a tenant
   */
  async getUsageHistory(
    tenantId: string,
    usageType?: 'messages' | 'api_calls' | 'storage_mb',
    limit: number = 12,
  ): Promise<UsageRecord[]> {
    let query = `
      SELECT tenant_id, usage_type, count, period_start, period_end
      FROM usage_records
      WHERE tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (usageType) {
      query += ` AND usage_type = $2`;
      params.push(usageType);
    }

    query += ` ORDER BY period_start DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const records = await this.db.queryMany<any>(query, params);
    return records.map((r) => ({
      tenantId: r.tenant_id,
      usageType: r.usage_type,
      count: r.count,
      periodStart: r.period_start,
      periodEnd: r.period_end,
    }));
  }

  /**
   * Reset usage for a tenant (for testing or manual reset)
   */
  async resetUsage(tenantId: string): Promise<void> {
    await this.db.query('DELETE FROM usage_records WHERE tenant_id = $1', [tenantId]);
    this.logger.log(`Reset usage for tenant ${tenantId}`);
  }
}

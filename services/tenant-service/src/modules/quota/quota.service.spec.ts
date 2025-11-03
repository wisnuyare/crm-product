import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { DatabaseService } from '../../database/database.service';

describe('QuotaService', () => {
  let service: QuotaService;
  let databaseService: DatabaseService;

  // Mock data
  const mockTenantId = '00000000-0000-0000-0000-000000000001';
  const mockSubscription = {
    id: 'sub-1',
    tenant_id: mockTenantId,
    tier: 'starter',
    status: 'active',
    message_quota: 500,
    outlet_limit: 1,
    knowledge_base_limit: 1,
    storage_limit_mb: 50,
    monthly_price: 99.0,
    overage_rate: 0.1,
  };

  // Mock DatabaseService
  const mockDatabaseService = {
    query: jest.fn(),
    queryOne: jest.fn(),
    queryMany: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<QuotaService>(QuotaService);
    databaseService = module.get<DatabaseService>(DatabaseService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTierDefinition', () => {
    it('should return Starter tier definition', () => {
      const tier = service.getTierDefinition('starter');
      expect(tier).toBeDefined();
      expect(tier.name).toBe('Starter');
      expect(tier.messageQuota).toBe(500);
      expect(tier.outletLimit).toBe(1);
      expect(tier.monthlyPrice).toBe(99.0);
    });

    it('should return Growth tier definition', () => {
      const tier = service.getTierDefinition('growth');
      expect(tier).toBeDefined();
      expect(tier.name).toBe('Growth');
      expect(tier.messageQuota).toBe(2000);
      expect(tier.outletLimit).toBe(3);
      expect(tier.monthlyPrice).toBe(299.0);
    });

    it('should return Enterprise tier definition', () => {
      const tier = service.getTierDefinition('enterprise');
      expect(tier).toBeDefined();
      expect(tier.name).toBe('Enterprise');
      expect(tier.messageQuota).toBe(10000);
      expect(tier.outletLimit).toBe(10);
      expect(tier.knowledgeBaseLimit).toBe(-1); // unlimited
      expect(tier.monthlyPrice).toBe(799.0);
    });

    it('should be case-insensitive', () => {
      const tier1 = service.getTierDefinition('STARTER');
      const tier2 = service.getTierDefinition('Starter');
      const tier3 = service.getTierDefinition('starter');

      expect(tier1).toEqual(tier2);
      expect(tier2).toEqual(tier3);
    });

    it('should throw NotFoundException for invalid tier', () => {
      expect(() => service.getTierDefinition('invalid')).toThrow(NotFoundException);
      expect(() => service.getTierDefinition('invalid')).toThrow(
        "Subscription tier 'invalid' not found",
      );
    });
  });

  describe('getAllTiers', () => {
    it('should return all three tiers', () => {
      const tiers = service.getAllTiers();
      expect(tiers).toHaveLength(3);
      expect(tiers.map((t) => t.name)).toEqual(['Starter', 'Growth', 'Enterprise']);
    });

    it('should return tiers with correct properties', () => {
      const tiers = service.getAllTiers();
      tiers.forEach((tier) => {
        expect(tier).toHaveProperty('name');
        expect(tier).toHaveProperty('messageQuota');
        expect(tier).toHaveProperty('outletLimit');
        expect(tier).toHaveProperty('knowledgeBaseLimit');
        expect(tier).toHaveProperty('storageLimitMB');
        expect(tier).toHaveProperty('monthlyPrice');
        expect(tier).toHaveProperty('overageRate');
      });
    });
  });

  describe('getQuotaStatus', () => {
    beforeEach(() => {
      // Mock subscription query
      mockDatabaseService.queryOne.mockImplementation((query: string) => {
        if (query.includes('FROM subscriptions')) {
          return Promise.resolve(mockSubscription);
        }
        if (query.includes('FROM usage_records') && query.includes('messages')) {
          return Promise.resolve({ total: 450 }); // 90% of 500
        }
        if (query.includes('FROM outlets')) {
          return Promise.resolve({ count: 1 });
        }
        if (query.includes('FROM knowledge_bases')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({ total: 25 }); // 25MB
        }
        return Promise.resolve(null);
      });
    });

    it('should return complete quota status', async () => {
      const status = await service.getQuotaStatus(mockTenantId);

      expect(status).toBeDefined();
      expect(status.tenantId).toBe(mockTenantId);
      expect(status.subscription.tier).toBe('starter');
      expect(status.usage.messages).toBe(450);
      expect(status.usage.outlets).toBe(1);
    });

    it('should calculate correct percentages', async () => {
      const status = await service.getQuotaStatus(mockTenantId);

      expect(status.percentages.messages).toBe(90); // 450/500 * 100
      expect(status.percentages.outlets).toBe(100); // 1/1 * 100
      expect(status.percentages.storage).toBe(50); // 25/50 * 100
    });

    it('should generate warnings at 80% threshold', async () => {
      mockDatabaseService.queryOne.mockImplementation((query: string) => {
        if (query.includes('FROM subscriptions')) {
          return Promise.resolve(mockSubscription);
        }
        if (query.includes('FROM usage_records') && query.includes('messages')) {
          return Promise.resolve({ total: 450 }); // 90%
        }
        if (query.includes('FROM outlets')) {
          return Promise.resolve({ count: 1 }); // 100%
        }
        if (query.includes('FROM knowledge_bases')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({ total: 45 }); // 90%
        }
        return Promise.resolve(null);
      });

      const status = await service.getQuotaStatus(mockTenantId);

      expect(status.warnings).toContain('Message quota at 90.0%');
      expect(status.warnings).toContain('Outlet limit at 100.0%');
      expect(status.warnings).toContain('Storage usage at 90.0%');
    });

    it('should set isOverLimit to true when messages > 105%', async () => {
      mockDatabaseService.queryOne.mockImplementation((query: string) => {
        if (query.includes('FROM subscriptions')) {
          return Promise.resolve(mockSubscription);
        }
        if (query.includes('FROM usage_records') && query.includes('messages')) {
          return Promise.resolve({ total: 530 }); // 106% of 500
        }
        if (query.includes('FROM outlets')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM knowledge_bases')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({ total: 0 });
        }
        return Promise.resolve(null);
      });

      const status = await service.getQuotaStatus(mockTenantId);

      expect(status.isOverLimit).toBe(true);
      expect(status.canSendMessage).toBe(false);
    });

    it('should set canSendMessage to true when messages < 105%', async () => {
      mockDatabaseService.queryOne.mockImplementation((query: string) => {
        if (query.includes('FROM subscriptions')) {
          return Promise.resolve(mockSubscription);
        }
        if (query.includes('FROM usage_records') && query.includes('messages')) {
          return Promise.resolve({ total: 500 }); // 100%
        }
        if (query.includes('FROM outlets')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM knowledge_bases')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({ total: 0 });
        }
        return Promise.resolve(null);
      });

      const status = await service.getQuotaStatus(mockTenantId);

      expect(status.isOverLimit).toBe(false);
      expect(status.canSendMessage).toBe(true); // 100% < 105%
    });

    it('should set canCreateOutlet to false when at limit', async () => {
      mockDatabaseService.queryOne.mockImplementation((query: string) => {
        if (query.includes('FROM subscriptions')) {
          return Promise.resolve(mockSubscription);
        }
        if (query.includes('FROM usage_records')) {
          return Promise.resolve({ total: 0 });
        }
        if (query.includes('FROM outlets')) {
          return Promise.resolve({ count: 1 }); // At limit
        }
        if (query.includes('FROM knowledge_bases')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({ total: 0 });
        }
        return Promise.resolve(null);
      });

      const status = await service.getQuotaStatus(mockTenantId);

      expect(status.canCreateOutlet).toBe(false);
    });

    it('should throw NotFoundException when no active subscription exists', async () => {
      mockDatabaseService.queryOne.mockResolvedValue(null);

      await expect(service.getQuotaStatus(mockTenantId)).rejects.toThrow(NotFoundException);
      await expect(service.getQuotaStatus(mockTenantId)).rejects.toThrow(
        `No active subscription found for tenant ${mockTenantId}`,
      );
    });

    it('should handle unlimited knowledge bases for Enterprise', async () => {
      const enterpriseSubscription = {
        ...mockSubscription,
        tier: 'enterprise',
        knowledge_base_limit: -1, // unlimited
      };

      mockDatabaseService.queryOne.mockImplementation((query: string) => {
        if (query.includes('FROM subscriptions')) {
          return Promise.resolve(enterpriseSubscription);
        }
        if (query.includes('FROM knowledge_bases')) {
          return Promise.resolve({ count: 100 }); // Any number
        }
        if (query.includes('FROM usage_records')) {
          return Promise.resolve({ total: 0 });
        }
        if (query.includes('FROM outlets')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({ total: 0 });
        }
        return Promise.resolve(null);
      });

      const status = await service.getQuotaStatus(mockTenantId);

      expect(status.percentages.knowledgeBases).toBe(0); // Unlimited = 0%
      expect(status.subscription.knowledgeBaseLimit).toBe(-1);
    });
  });

  describe('checkMessageQuota', () => {
    it('should pass when under quota', async () => {
      mockDatabaseService.queryOne.mockImplementation((query: string) => {
        if (query.includes('FROM subscriptions')) {
          return Promise.resolve(mockSubscription);
        }
        if (query.includes('FROM usage_records')) {
          return Promise.resolve({ total: 100 }); // 20% of 500
        }
        if (query.includes('FROM outlets')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM knowledge_bases')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({ total: 0 });
        }
        return Promise.resolve(null);
      });

      await expect(service.checkMessageQuota(mockTenantId)).resolves.not.toThrow();
    });

    it('should throw ForbiddenException when over 105% limit', async () => {
      mockDatabaseService.queryOne.mockImplementation((query: string) => {
        if (query.includes('FROM subscriptions')) {
          return Promise.resolve(mockSubscription);
        }
        if (query.includes('FROM usage_records')) {
          return Promise.resolve({ total: 530 }); // 106% of 500
        }
        if (query.includes('FROM outlets')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM knowledge_bases')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({ total: 0 });
        }
        return Promise.resolve(null);
      });

      await expect(service.checkMessageQuota(mockTenantId)).rejects.toThrow(ForbiddenException);
      await expect(service.checkMessageQuota(mockTenantId)).rejects.toThrow(
        'Message quota exceeded',
      );
    });

    it('should allow messages in grace period (100-105%)', async () => {
      mockDatabaseService.queryOne.mockImplementation((query: string) => {
        if (query.includes('FROM subscriptions')) {
          return Promise.resolve(mockSubscription);
        }
        if (query.includes('FROM usage_records')) {
          return Promise.resolve({ total: 520 }); // 104% of 500
        }
        if (query.includes('FROM outlets')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM knowledge_bases')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({ total: 0 });
        }
        return Promise.resolve(null);
      });

      await expect(service.checkMessageQuota(mockTenantId)).resolves.not.toThrow();
    });
  });

  describe('checkOutletLimit', () => {
    it('should pass when under limit', async () => {
      mockDatabaseService.queryOne.mockImplementation((query: string) => {
        if (query.includes('FROM subscriptions')) {
          return Promise.resolve({ ...mockSubscription, outlet_limit: 3 });
        }
        if (query.includes('FROM outlets')) {
          return Promise.resolve({ count: 2 }); // 2/3
        }
        if (query.includes('FROM usage_records')) {
          return Promise.resolve({ total: 0 });
        }
        if (query.includes('FROM knowledge_bases')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({ total: 0 });
        }
        return Promise.resolve(null);
      });

      await expect(service.checkOutletLimit(mockTenantId)).resolves.not.toThrow();
    });

    it('should throw ForbiddenException when at limit', async () => {
      mockDatabaseService.queryOne.mockImplementation((query: string) => {
        if (query.includes('FROM subscriptions')) {
          return Promise.resolve(mockSubscription);
        }
        if (query.includes('FROM outlets')) {
          return Promise.resolve({ count: 1 }); // 1/1 = 100%
        }
        if (query.includes('FROM usage_records')) {
          return Promise.resolve({ total: 0 });
        }
        if (query.includes('FROM knowledge_bases')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({ total: 0 });
        }
        return Promise.resolve(null);
      });

      await expect(service.checkOutletLimit(mockTenantId)).rejects.toThrow(ForbiddenException);
      await expect(service.checkOutletLimit(mockTenantId)).rejects.toThrow('Outlet limit reached');
    });
  });

  describe('checkStorageQuota', () => {
    it('should pass when under storage limit', async () => {
      mockDatabaseService.queryOne.mockImplementation((query: string) => {
        if (query.includes('FROM subscriptions')) {
          return Promise.resolve(mockSubscription);
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({ total: 25 }); // 25MB used of 50MB
        }
        if (query.includes('FROM outlets')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM usage_records')) {
          return Promise.resolve({ total: 0 });
        }
        if (query.includes('FROM knowledge_bases')) {
          return Promise.resolve({ count: 0 });
        }
        return Promise.resolve(null);
      });

      const fileSizeBytes = 10 * 1024 * 1024; // 10MB
      await expect(service.checkStorageQuota(mockTenantId, fileSizeBytes)).resolves.not.toThrow();
    });

    it('should throw ForbiddenException when storage would exceed limit', async () => {
      mockDatabaseService.queryOne.mockImplementation((query: string) => {
        if (query.includes('FROM subscriptions')) {
          return Promise.resolve(mockSubscription);
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({ total: 45 }); // 45MB used of 50MB
        }
        if (query.includes('FROM outlets')) {
          return Promise.resolve({ count: 0 });
        }
        if (query.includes('FROM usage_records')) {
          return Promise.resolve({ total: 0 });
        }
        if (query.includes('FROM knowledge_bases')) {
          return Promise.resolve({ count: 0 });
        }
        return Promise.resolve(null);
      });

      const fileSizeBytes = 10 * 1024 * 1024; // 10MB - would total 55MB
      await expect(service.checkStorageQuota(mockTenantId, fileSizeBytes)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.checkStorageQuota(mockTenantId, fileSizeBytes)).rejects.toThrow(
        'Storage quota exceeded',
      );
    });
  });

  describe('recordMessageUsage', () => {
    it('should insert usage record with correct parameters', async () => {
      mockDatabaseService.query.mockResolvedValue(undefined);

      await service.recordMessageUsage(mockTenantId, 5);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO usage_records'),
        expect.arrayContaining([mockTenantId, 5]),
      );
    });

    it('should default to 1 message if count not provided', async () => {
      mockDatabaseService.query.mockResolvedValue(undefined);

      await service.recordMessageUsage(mockTenantId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([mockTenantId, 1]),
      );
    });

    it('should use ON CONFLICT to update existing records', async () => {
      mockDatabaseService.query.mockResolvedValue(undefined);

      await service.recordMessageUsage(mockTenantId, 10);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array),
      );
    });
  });

  describe('getUsageHistory', () => {
    it('should return usage history', async () => {
      const mockHistory = [
        {
          tenant_id: mockTenantId,
          usage_type: 'messages',
          count: 450,
          period_start: new Date('2025-11-01'),
          period_end: new Date('2025-12-01'),
        },
      ];

      mockDatabaseService.queryMany.mockResolvedValue(mockHistory);

      const history = await service.getUsageHistory(mockTenantId);

      expect(history).toHaveLength(1);
      expect(history[0].usageType).toBe('messages');
      expect(history[0].count).toBe(450);
    });

    it('should filter by usage type', async () => {
      mockDatabaseService.queryMany.mockResolvedValue([]);

      await service.getUsageHistory(mockTenantId, 'messages', 6);

      expect(mockDatabaseService.queryMany).toHaveBeenCalledWith(
        expect.stringContaining('AND usage_type = $2'),
        expect.arrayContaining([mockTenantId, 'messages', 6]),
      );
    });

    it('should limit results', async () => {
      mockDatabaseService.queryMany.mockResolvedValue([]);

      await service.getUsageHistory(mockTenantId, undefined, 5);

      expect(mockDatabaseService.queryMany).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([mockTenantId, 5]),
      );
    });
  });

  describe('resetUsage', () => {
    it('should delete all usage records for tenant', async () => {
      mockDatabaseService.query.mockResolvedValue(undefined);

      await service.resetUsage(mockTenantId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'DELETE FROM usage_records WHERE tenant_id = $1',
        [mockTenantId],
      );
    });
  });
});

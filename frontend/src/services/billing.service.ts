import { api } from './api';
import type { QuotaStatus } from '../types';

export const billingService = {
  // Get quota status
  getQuotaStatus: async (tenantId: string): Promise<QuotaStatus> => {
    const response = await api.billing.get(`/api/v1/billing/tenants/${tenantId}/quota`);
    return response.data;
  },

  // Get subscription tiers
  getSubscriptionTiers: async () => {
    const response = await api.billing.get('/api/v1/billing/tiers');
    return response.data;
  },

  // Health check
  healthCheck: async () => {
    const response = await api.billing.get('/health');
    return response.data;
  },
};

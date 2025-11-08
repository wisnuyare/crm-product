import { api } from './api';
import type { DashboardMetrics, TenantSummary } from '../types';

export const analyticsService = {
  // Get dashboard metrics
  getDashboardMetrics: async (params: {
    startDate?: string;
    endDate?: string;
    outletId?: string;
  }): Promise<DashboardMetrics> => {
    const response = await api.analytics.get('/api/v1/metrics/dashboard', { params });
    return response.data;
  },

  // Get tenant summary
  getTenantSummary: async (params: {
    startDate?: string;
    endDate?: string;
  }): Promise<TenantSummary> => {
    const response = await api.analytics.get('/api/v1/metrics/summary', { params });
    return response.data;
  },

  // Health check
  healthCheck: async () => {
    const response = await api.analytics.get('/health');
    return response.data;
  },
};

import api from './api';
import type { PlatformSummary, TenantSummary } from '../types';

export const analyticsService = {
  getPlatformSummary: async (): Promise<PlatformSummary> => {
    return api.analytics.get('/api/v1/metrics/platform/summary');
  },
  getTenantSummary: async (params?: { startDate?: string; endDate?: string }): Promise<TenantSummary> => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('start_date', params.startDate);
    if (params?.endDate) queryParams.append('end_date', params.endDate);
    const queryString = queryParams.toString();
    return api.analytics.get(`/api/v1/metrics/summary${queryString ? `?${queryString}` : ''}`);
  },
};
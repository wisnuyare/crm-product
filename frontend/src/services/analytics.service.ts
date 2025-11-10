import api from './api';
import type { PlatformSummary } from '../types';

export const analyticsService = {
  getPlatformSummary: async (): Promise<PlatformSummary> => {
    return api.analytics.get('/api/v1/metrics/platform/summary');
  },
};
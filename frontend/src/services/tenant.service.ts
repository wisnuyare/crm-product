import { api } from './api';
import type { Tenant, Outlet } from '../types';

export const tenantService = {
  // Get current tenant
  getTenant: async (tenantId: string): Promise<Tenant> => {
    const response = await api.tenant.get(`/api/v1/tenants/${tenantId}`);
    return response.data;
  },

  // Get tenant by slug
  getTenantBySlug: async (slug: string): Promise<Tenant> => {
    const response = await api.tenant.get(`/api/v1/tenants/slug/${slug}`);
    return response.data;
  },

  // Update tenant
  updateTenant: async (tenantId: string, data: Partial<Tenant>): Promise<Tenant> => {
    const response = await api.tenant.put(`/api/v1/tenants/${tenantId}`, data);
    return response.data;
  },

  // Get outlets
  getOutlets: async (tenantId: string): Promise<Outlet[]> => {
    const response = await api.tenant.get(`/api/v1/tenants/${tenantId}/outlets`);
    return response.data;
  },

  // Update LLM instructions
  updateInstructions: async (tenantId: string, instructions: string) => {
    const response = await api.tenant.put(`/api/v1/tenants/${tenantId}/llm-instructions`, { instructions });
    return response.data;
  },

  // Health check
  healthCheck: async () => {
    const response = await api.tenant.get('/health');
    return response.data;
  },
};

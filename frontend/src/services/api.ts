// Base API configuration
const API_BASE_URLS = {
  tenant: 'http://localhost:3001',
  billing: 'http://localhost:3002',
  knowledge: 'http://localhost:3003',
  conversation: 'http://localhost:3004',
  llm: 'http://localhost:3005',
  messageSender: 'http://localhost:3006',
  analytics: 'http://localhost:3007',
  booking: 'http://localhost:3008',
  order: 'http://localhost:3009',
};

// Mock tenant ID for testing
export const MOCK_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Fetch wrapper with error handling
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('authToken');

  const headers = {
    'Content-Type': 'application/json',
    'X-Tenant-Id': MOCK_TENANT_ID,
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle unauthorized
  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Request failed');
  }

  return response.json();
}

// API client factory
function createApiClient(baseURL: string) {
  return {
    get: (path: string) => fetchWithAuth(`${baseURL}${path}`),
    post: (path: string, data?: any) =>
      fetchWithAuth(`${baseURL}${path}`, {
        method: 'POST',
        body: data ? JSON.stringify(data) : undefined,
      }),
    put: (path: string, data?: any) =>
      fetchWithAuth(`${baseURL}${path}`, {
        method: 'PUT',
        body: data ? JSON.stringify(data) : undefined,
      }),
    delete: (path: string) =>
      fetchWithAuth(`${baseURL}${path}`, { method: 'DELETE' }),
  };
}

// API clients for each service
export const api = {
  tenant: {
    ...createApiClient(API_BASE_URLS.tenant),
    updateLlmInstructions: (tenantId: string, instructions: string) => {
      return fetchWithAuth(`${API_BASE_URLS.tenant}/api/v1/tenants/${tenantId}/llm-instructions`, {
        method: 'PUT',
        body: JSON.stringify({ instructions }),
      });
    },
    createOutlet: (outletData: any) => {
      return fetchWithAuth(`${API_BASE_URLS.tenant}/api/v1/outlets`, {
        method: 'POST',
        body: JSON.stringify(outletData),
      });
    },
  },
  billing: createApiClient(API_BASE_URLS.billing),
  knowledge: createApiClient(API_BASE_URLS.knowledge),
  conversation: createApiClient(API_BASE_URLS.conversation),
  llm: createApiClient(API_BASE_URLS.llm),
  messageSender: createApiClient(API_BASE_URLS.messageSender),
  analytics: createApiClient(API_BASE_URLS.analytics),
  booking: createApiClient(API_BASE_URLS.booking),
  order: createApiClient(API_BASE_URLS.order),
};

export default api;

import { auth } from './firebase';

// Base API configuration
export const API_BASE_URLS = {
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

// Fetch wrapper with Firebase JWT authentication
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  // Get current Firebase user and JWT token
  const user = auth.currentUser;
  if (!user) {
    // Redirect to login if not authenticated
    window.location.href = '/login';
    throw new Error('User not authenticated. Please log in.');
  }

  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch (error) {
    console.error('Failed to get ID token:', error);
    window.location.href = '/login';
    throw new Error('Authentication failed. Please log in again.');
  }

  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;
  const rawHeaders = options?.headers;
  let customHeaders: Record<string, string> = {};
  if (rawHeaders instanceof Headers) {
    customHeaders = Object.fromEntries(rawHeaders.entries());
  } else if (rawHeaders) {
    customHeaders = rawHeaders as Record<string, string>;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
    ...customHeaders,
  };

  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle unauthorized
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized. Please log in again.');
  }

  // Handle forbidden
  if (response.status === 403) {
    throw new Error('Access denied. You do not have permission to perform this action.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Request failed');
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
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
    getTenant: (tenantId: string) =>
      fetchWithAuth(`${API_BASE_URLS.tenant}/api/v1/tenants/${tenantId}`),
    getQuotaStatus: () => fetchWithAuth(`${API_BASE_URLS.tenant}/api/v1/quota/status`),
    listOutlets: () => fetchWithAuth(`${API_BASE_URLS.tenant}/api/v1/outlets`),
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
    updateOutlet: (outletId: string, outletData: any) => {
      return fetchWithAuth(`${API_BASE_URLS.tenant}/api/v1/outlets/${outletId}`, {
        method: 'PUT',
        body: JSON.stringify(outletData),
      });
    },
  },
  billing: createApiClient(API_BASE_URLS.billing),
  knowledge: createApiClient(API_BASE_URLS.knowledge),
  knowledgeService: {
    listKnowledgeBases: () =>
      fetchWithAuth(`${API_BASE_URLS.knowledge}/api/v1/knowledge-bases`),
    createKnowledgeBase: (data: { outlet_id: string; name: string; description?: string }) =>
      fetchWithAuth(`${API_BASE_URLS.knowledge}/api/v1/knowledge-bases`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteKnowledgeBase: (knowledgeBaseId: string) =>
      fetchWithAuth(`${API_BASE_URLS.knowledge}/api/v1/knowledge-bases/${knowledgeBaseId}`, {
        method: 'DELETE',
      }),
    listDocuments: (knowledgeBaseId: string) =>
      fetchWithAuth(
        `${API_BASE_URLS.knowledge}/api/v1/knowledge-bases/${knowledgeBaseId}/documents`,
      ),
    uploadDocument: (knowledgeBaseId: string, file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return fetchWithAuth(
        `${API_BASE_URLS.knowledge}/api/v1/knowledge-bases/${knowledgeBaseId}/documents`,
        {
          method: 'POST',
          body: formData,
        },
      );
    },
    deleteDocument: (knowledgeBaseId: string, documentId: string) =>
      fetchWithAuth(
        `${API_BASE_URLS.knowledge}/api/v1/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`,
        { method: 'DELETE' },
      ),
  },
  conversation: createApiClient(API_BASE_URLS.conversation),
  conversationService: {
    getActiveConversations: (outletId?: string) => {
      const params = outletId ? `?outlet_id=${encodeURIComponent(outletId)}` : '';
      return fetchWithAuth(`${API_BASE_URLS.conversation}/api/v1/conversations/active${params}`);
    },
    getConversation: (conversationId: string, includeMessages = false) => {
      const params = includeMessages ? '?include_messages=true' : '';
      return fetchWithAuth(
        `${API_BASE_URLS.conversation}/api/v1/conversations/${conversationId}${params}`
      );
    },
    getMessages: (conversationId: string, limit = 100) => {
      return fetchWithAuth(
        `${API_BASE_URLS.conversation}/api/v1/conversations/${conversationId}/messages?limit=${limit}`
      );
    },
    sendMessage: (payload: {
      conversation_id: string;
      sender_type: 'customer' | 'llm' | 'agent';
      sender_id?: string;
      content: string;
    }) => {
      return fetchWithAuth(`${API_BASE_URLS.conversation}/api/v1/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    requestHandoff: (conversationId: string, reason: string, agentId?: string) => {
      return fetchWithAuth(
        `${API_BASE_URLS.conversation}/api/v1/conversations/${conversationId}/handoff`,
        {
          method: 'POST',
          body: JSON.stringify({ reason, agent_id: agentId }),
        },
      );
    },
    resumeHandoff: (conversationId: string) => {
      return fetchWithAuth(
        `${API_BASE_URLS.conversation}/api/v1/conversations/${conversationId}/handoff/release`,
        { method: 'POST' },
      );
    },
  },
  llm: createApiClient(API_BASE_URLS.llm),
  messageSender: createApiClient(API_BASE_URLS.messageSender),
  analytics: createApiClient(API_BASE_URLS.analytics),
  booking: createApiClient(API_BASE_URLS.booking),
  order: createApiClient(API_BASE_URLS.order),
};

export default api;

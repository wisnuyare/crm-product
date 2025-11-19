import { api } from './api';
import type { KnowledgeBase, Document } from '../types';

export const knowledgeService = {
  // Get knowledge bases
  getKnowledgeBases: async (tenantId: string): Promise<KnowledgeBase[]> => {
    const queryParams = new URLSearchParams();
    queryParams.append('tenant_id', tenantId);
    const queryString = queryParams.toString();
    const response = await api.knowledge.get(`/api/v1/knowledge-bases?${queryString}`);
    return response.data;
  },

  // Get single knowledge base
  getKnowledgeBase: async (kbId: string): Promise<KnowledgeBase> => {
    const response = await api.knowledge.get(`/api/v1/knowledge-bases/${kbId}`);
    return response.data;
  },

  // Create knowledge base
  createKnowledgeBase: async (data: { name: string; description?: string }): Promise<KnowledgeBase> => {
    const response = await api.knowledge.post('/api/v1/knowledge-bases', data);
    return response.data;
  },

  // Get documents
  getDocuments: async (kbId: string): Promise<Document[]> => {
    const response = await api.knowledge.get(`/api/v1/knowledge-bases/${kbId}/documents`);
    return response.data;
  },

  // Upload document
  uploadDocument: async (knowledgeBaseId: string, file: File): Promise<Document> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.knowledge.post(
      `/api/v1/knowledge-bases/${knowledgeBaseId}/documents`,
      formData,
      {
        // 'Content-Type': 'multipart/form-data', // fetch will set this automatically for FormData
      }
    );
    return response.data;
  },

  // Delete document
  deleteDocument: async (kbId: string, docId: string): Promise<void> => {
    await api.knowledge.delete(`/api/v1/knowledge-bases/${kbId}/documents/${docId}`);
  },

  // Health check
  healthCheck: async () => {
    const response = await api.knowledge.get('/health');
    return response.data;
  },
};

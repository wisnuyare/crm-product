import { api } from './api';
import type { Conversation, Message } from '../types';

export const conversationService = {
  // Get conversations for an outlet
  getConversations: async (outletId: string): Promise<Conversation[]> => {
    const response = await api.conversation.get(`/api/v1/conversations/outlet/${outletId}/active`);
    return response.data;
  },

  // Get single conversation
  getConversation: async (conversationId: string): Promise<Conversation> => {
    const response = await api.conversation.get(`/api/v1/conversations/${conversationId}`);
    return response.data;
  },

  // Get messages for a conversation
  getMessages: async (conversationId: string): Promise<Message[]> => {
    const response = await api.conversation.get(`/api/v1/conversations/${conversationId}/messages`);
    return response.data;
  },

  // Send message
  sendMessage: async (data: {
    conversationId: string;
    senderType: 'agent';
    content: string;
  }): Promise<Message> => {
    const response = await api.conversation.post(`/api/v1/conversations/${data.conversationId}/messages`, data);
    return response.data;
  },

  // Request handoff
  requestHandoff: async (conversationId: string, reason: string): Promise<Conversation> => {
    const response = await api.conversation.put(`/api/v1/conversations/${conversationId}/handoff`, { reason });
    return response.data;
  },

  // Health check
  healthCheck: async () => {
    const response = await api.conversation.get('/health');
    return response.data;
  },
};

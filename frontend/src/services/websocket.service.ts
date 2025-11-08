import { io, Socket } from 'socket.io-client';
import type { Conversation, Message } from '../types';

class WebSocketService {
  private socket: Socket | null = null;
  private conversationCallbacks: Map<string, (message: Message) => void> = new Map();
  private newConversationCallbacks: Set<(conversation: Conversation) => void> = new Set();

  connect(tenantId: string) {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io('http://localhost:3004', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      // Join tenant room
      this.socket?.emit('tenant:join', { tenant_id: tenantId });
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    // Listen for new conversations
    this.socket.on('conversation:new', (conversation: Conversation) => {
      this.newConversationCallbacks.forEach(callback => callback(conversation));
    });

    // Listen for new messages
    this.socket.on('conversation:message', (message: Message) => {
      const callback = this.conversationCallbacks.get(message.conversationId);
      if (callback) {
        callback(message);
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.conversationCallbacks.clear();
    this.newConversationCallbacks.clear();
  }

  joinConversation(conversationId: string) {
    if (!this.socket?.connected) {
      console.warn('Socket not connected');
      return;
    }
    this.socket.emit('conversation:join', { conversation_id: conversationId });
  }

  leaveConversation(conversationId: string) {
    if (!this.socket?.connected) {
      return;
    }
    this.socket.emit('conversation:leave', { conversation_id: conversationId });
    this.conversationCallbacks.delete(conversationId);
  }

  onNewMessage(conversationId: string, callback: (message: Message) => void) {
    this.conversationCallbacks.set(conversationId, callback);
  }

  onNewConversation(callback: (conversation: Conversation) => void) {
    this.newConversationCallbacks.add(callback);
  }

  offNewConversation(callback: (conversation: Conversation) => void) {
    this.newConversationCallbacks.delete(callback);
  }
}

export const websocketService = new WebSocketService();

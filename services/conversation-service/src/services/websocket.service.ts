import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { Conversation, Message, HandoffRequest } from '../types';

export class WebSocketService {
  private io: SocketIOServer;

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*', // TODO: Configure for production
        methods: ['GET', 'POST'],
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`✅ Client connected: ${socket.id}`);

      // Join conversation room
      socket.on('conversation:join', (data: { conversation_id: string }) => {
        socket.join(`conversation:${data.conversation_id}`);
        console.log(`Client ${socket.id} joined conversation ${data.conversation_id}`);
      });

      // Leave conversation room
      socket.on('conversation:leave', (data: { conversation_id: string }) => {
        socket.leave(`conversation:${data.conversation_id}`);
        console.log(`Client ${socket.id} left conversation ${data.conversation_id}`);
      });

      // Join tenant room (for all conversations)
      socket.on('tenant:join', (data: { tenant_id: string }) => {
        socket.join(`tenant:${data.tenant_id}`);
        console.log(`Client ${socket.id} joined tenant ${data.tenant_id}`);
      });

      // Agent takeover
      socket.on('agent:takeover', (data: { conversation_id: string; agent_id: string }) => {
        this.emitToConversation(data.conversation_id, 'agent:joined', {
          conversation_id: data.conversation_id,
          agent_id: data.agent_id,
        });
      });

      socket.on('disconnect', () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Emit new conversation to tenant room
   */
  emitNewConversation(tenantId: string, conversation: Conversation) {
    this.io.to(`tenant:${tenantId}`).emit('conversation:new', conversation);
  }

  /**
   * Emit new message to conversation room
   */
  emitNewMessage(conversationId: string, message: Message) {
    this.io.to(`conversation:${conversationId}`).emit('conversation:message', message);
  }

  /**
   * Emit handoff request
   */
  emitHandoffRequest(conversationId: string, handoff: HandoffRequest) {
    this.io.to(`conversation:${conversationId}`).emit('conversation:handoff', handoff);
  }

  /**
   * Emit conversation status change
   */
  emitStatusChange(conversationId: string, status: string) {
    this.io.to(`conversation:${conversationId}`).emit('conversation:status', {
      conversation_id: conversationId,
      status,
    });
  }

  /**
   * Emit to specific conversation
   */
  emitToConversation(conversationId: string, event: string, data: any) {
    this.io.to(`conversation:${conversationId}`).emit(event, data);
  }

  /**
   * Emit to tenant (all conversations)
   */
  emitToTenant(tenantId: string, event: string, data: any) {
    this.io.to(`tenant:${tenantId}`).emit(event, data);
  }

  /**
   * Get Socket.IO server instance
   */
  getIO(): SocketIOServer {
    return this.io;
  }
}

export let websocketService: WebSocketService;

export function initializeWebSocket(httpServer: HttpServer): WebSocketService {
  websocketService = new WebSocketService(httpServer);
  return websocketService;
}

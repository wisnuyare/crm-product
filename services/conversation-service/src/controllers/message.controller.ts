import { Request, Response } from 'express';
import { messageService } from '../services/message.service';
import { conversationService } from '../services/conversation.service';
import { handoffService } from '../services/handoff.service';
import { websocketService } from '../services/websocket.service';
import { CreateMessageDto } from '../types';

export class MessageController {
  /**
   * Create a new message
   * POST /api/v1/messages
   */
  async createMessage(req: Request, res: Response) {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;

      if (!tenantId) {
        return res.status(400).json({ error: 'X-Tenant-Id header required' });
      }

      const dto: CreateMessageDto = req.body;

      // Verify conversation exists and belongs to tenant
      const conversation = await conversationService.getConversation(
        dto.conversation_id,
        tenantId
      );

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Create message
      const message = await messageService.createMessage(dto);

      // Emit WebSocket event
      websocketService.emitNewMessage(dto.conversation_id, message);

      // Check for handoff detection (only for customer messages)
      if (dto.sender_type === 'customer') {
        const handoffDetection = await handoffService.detectHandoff(
          dto.content,
          dto.conversation_id
        );

        if (handoffDetection.shouldHandoff) {
          // Automatically request handoff
          await conversationService.requestHandoff(
            dto.conversation_id,
            tenantId,
            handoffDetection.reason
          );

          websocketService.emitHandoffRequest(dto.conversation_id, {
            conversation_id: dto.conversation_id,
            reason: handoffDetection.reason,
          });

          // Include handoff info in response
          return res.status(201).json({
            message,
            handoff_requested: true,
            handoff_reason: handoffDetection.reason,
          });
        }
      }

      res.status(201).json({ message, handoff_requested: false });
    } catch (error: any) {
      console.error('Error creating message:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get messages for a conversation
   * GET /api/v1/conversations/:conversationId/messages
   */
  async getMessages(req: Request, res: Response) {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { conversationId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!tenantId) {
        return res.status(400).json({ error: 'X-Tenant-Id header required' });
      }

      // Verify conversation belongs to tenant
      const conversation = await conversationService.getConversation(
        conversationId,
        tenantId
      );

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const messages = await messageService.getMessagesByConversation(
        conversationId,
        limit
      );

      res.json(messages);
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get recent messages for context
   * GET /api/v1/conversations/:conversationId/messages/recent
   */
  async getRecentMessages(req: Request, res: Response) {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { conversationId } = req.params;
      const count = parseInt(req.query.count as string) || 4;

      if (!tenantId) {
        return res.status(400).json({ error: 'X-Tenant-Id header required' });
      }

      // Verify conversation belongs to tenant
      const conversation = await conversationService.getConversation(
        conversationId,
        tenantId
      );

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const messages = await messageService.getRecentMessages(
        conversationId,
        count
      );

      res.json(messages);
    } catch (error: any) {
      console.error('Error fetching recent messages:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

export const messageController = new MessageController();

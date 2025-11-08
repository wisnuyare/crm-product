import { Request, Response } from 'express';
import { conversationService } from '../services/conversation.service';
import { messageService } from '../services/message.service';
import { handoffService } from '../services/handoff.service';
import { websocketService } from '../services/websocket.service';
import { CreateConversationDto, HandoffRequest } from '../types';

export class ConversationController {
  /**
   * Create a new conversation
   * POST /api/v1/conversations
   */
  async createConversation(req: Request, res: Response) {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;

      if (!tenantId) {
        return res.status(400).json({ error: 'X-Tenant-Id header required' });
      }

      const dto: CreateConversationDto = {
        ...req.body,
        tenant_id: tenantId,
      };

      const conversation = await conversationService.createConversation(dto);

      // Emit WebSocket event
      websocketService.emitNewConversation(tenantId, conversation);

      res.status(201).json(conversation);
    } catch (error: any) {
      console.error('Error creating conversation:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get conversation by ID
   * GET /api/v1/conversations/:id
   */
  async getConversation(req: Request, res: Response) {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { id } = req.params;
      const includeMessages = req.query.include_messages === 'true';

      if (!tenantId) {
        return res.status(400).json({ error: 'X-Tenant-Id header required' });
      }

      let result;
      if (includeMessages) {
        result = await conversationService.getConversationWithMessages(
          id,
          tenantId
        );
      } else {
        result = await conversationService.getConversation(id, tenantId);
      }

      if (!result) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      res.json(result);
    } catch (error: any) {
      console.error('Error fetching conversation:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get active conversations
   * GET /api/v1/conversations/active
   */
  async getActiveConversations(req: Request, res: Response) {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const outletId = req.query.outlet_id as string | undefined;

      if (!tenantId) {
        return res.status(400).json({ error: 'X-Tenant-Id header required' });
      }

      const conversations = await conversationService.getActiveConversations(
        tenantId,
        outletId
      );

      res.json(conversations);
    } catch (error: any) {
      console.error('Error fetching active conversations:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Find or create conversation by customer
   * POST /api/v1/conversations/find-or-create
   */
  async findOrCreateConversation(req: Request, res: Response) {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { outlet_id, customer_phone, customer_name } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'X-Tenant-Id header required' });
      }

      // Try to find existing active conversation
      let conversation = await conversationService.getConversationByCustomer(
        tenantId,
        outlet_id,
        customer_phone
      );

      // If not found, create new one
      if (!conversation) {
        conversation = await conversationService.createConversation({
          tenant_id: tenantId,
          outlet_id,
          customer_phone,
          customer_name,
        });

        websocketService.emitNewConversation(tenantId, conversation);
      }

      res.json(conversation);
    } catch (error: any) {
      console.error('Error finding/creating conversation:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Request handoff to human agent
   * POST /api/v1/conversations/:id/handoff
   */
  async requestHandoff(req: Request, res: Response) {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { id } = req.params;
      const { reason, agent_id } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'X-Tenant-Id header required' });
      }

      const conversation = await conversationService.requestHandoff(
        id,
        tenantId,
        reason,
        agent_id
      );

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Emit WebSocket event
      websocketService.emitHandoffRequest(id, {
        conversation_id: id,
        reason,
        agent_id,
      });

      res.json(conversation);
    } catch (error: any) {
      console.error('Error requesting handoff:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Assign agent to conversation
   * PUT /api/v1/conversations/:id/assign
   */
  async assignAgent(req: Request, res: Response) {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { id } = req.params;
      const { agent_id } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'X-Tenant-Id header required' });
      }

      const conversation = await conversationService.assignAgent(
        id,
        tenantId,
        agent_id
      );

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      websocketService.emitToConversation(id, 'agent:assigned', {
        conversation_id: id,
        agent_id,
      });

      res.json(conversation);
    } catch (error: any) {
      console.error('Error assigning agent:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update conversation status
   * PUT /api/v1/conversations/:id/status
   */
  async updateStatus(req: Request, res: Response) {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { id } = req.params;
      const { status } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'X-Tenant-Id header required' });
      }

      const conversation = await conversationService.updateConversationStatus(
        id,
        tenantId,
        status
      );

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      websocketService.emitStatusChange(id, status);

      res.json(conversation);
    } catch (error: any) {
      console.error('Error updating conversation status:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

export const conversationController = new ConversationController();

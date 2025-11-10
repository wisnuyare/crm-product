import { v4 as uuidv4 } from 'uuid';
import { db } from './database.service';
import {
  Conversation,
  CreateConversationDto,
  ConversationWithMessages,
  HandoffRequest,
} from '../types';

export class ConversationService {
  async createConversation(
    dto: CreateConversationDto
  ): Promise<Conversation> {
    const query = `
      INSERT INTO conversations (
        id, tenant_id, outlet_id, customer_phone, customer_name,
        status, started_at, last_message_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `;

    const values = [
      uuidv4(),
      dto.tenant_id,
      dto.outlet_id,
      dto.customer_phone,
      dto.customer_name || null,
      'active',
    ];

    const result = await db.query<Conversation>(query, values);
    return result.rows[0];
  }

  async getConversation(
    conversationId: string,
    tenantId: string
  ): Promise<Conversation | null> {
    const query = `
      SELECT * FROM conversations
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await db.query<Conversation>(query, [
      conversationId,
      tenantId,
    ]);
    return result.rows[0] || null;
  }

  async getConversationWithMessages(
    conversationId: string,
    tenantId: string,
    messageLimit: number = 50
  ): Promise<ConversationWithMessages | null> {
    const conversation = await this.getConversation(conversationId, tenantId);
    if (!conversation) return null;

    const messagesQuery = `
      SELECT * FROM messages
      WHERE conversation_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    const messages = await db.query(messagesQuery, [
      conversationId,
      messageLimit,
    ]);

    return {
      ...conversation,
      messages: messages.rows.reverse(), // Oldest first
    };
  }

  async getActiveConversations(
    tenantId: string,
    outletId?: string
  ): Promise<Conversation[]> {
    let query = `
      SELECT * FROM conversations
      WHERE tenant_id = $1 AND status = 'active'
    `;

    const values: any[] = [tenantId];

    if (outletId) {
      query += ` AND outlet_id = $2`;
      values.push(outletId);
    }

    query += ` ORDER BY last_message_at DESC`;

    const result = await db.query<Conversation>(query, values);
    return result.rows;
  }

  async getConversationByCustomer(
    tenantId: string,
    outletId: string,
    customerPhone: string
  ): Promise<Conversation | null> {
    const query = `
      SELECT * FROM conversations
      WHERE tenant_id = $1
        AND outlet_id = $2
        AND customer_phone = $3
        AND status = 'active'
      ORDER BY started_at DESC
      LIMIT 1
    `;

    const result = await db.query<Conversation>(query, [
      tenantId,
      outletId,
      customerPhone,
    ]);

    return result.rows[0] || null;
  }

  async updateConversationStatus(
    conversationId: string,
    tenantId: string,
    status: Conversation['status']
  ): Promise<Conversation | null> {
    const query = `
      UPDATE conversations
      SET status = $1,
          ended_at = CASE WHEN $1 IN ('resolved', 'expired') THEN NOW() ELSE ended_at END
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `;

    const result = await db.query<Conversation>(query, [
      status,
      conversationId,
      tenantId,
    ]);

    return result.rows[0] || null;
  }

  async requestHandoff(
    conversationId: string,
    tenantId: string,
    reason: string,
    agentId?: string
  ): Promise<Conversation | null> {
    const query = `
      UPDATE conversations
      SET handoff_requested = true,
          handoff_reason = $1,
          handoff_agent_id = $2,
          status = 'handed_off'
      WHERE id = $3 AND tenant_id = $4
      RETURNING *
    `;

    const result = await db.query<Conversation>(query, [
      reason,
      agentId || null,
      conversationId,
      tenantId,
    ]);

    return result.rows[0] || null;
  }

  async releaseHandoff(
    conversationId: string,
    tenantId: string
  ): Promise<Conversation | null> {
    const query = `
      UPDATE conversations
      SET handoff_requested = false,
          handoff_reason = NULL,
          handoff_agent_id = NULL,
          status = 'active'
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `;

    const result = await db.query<Conversation>(query, [
      conversationId,
      tenantId,
    ]);

    return result.rows[0] || null;
  }

  async assignAgent(
    conversationId: string,
    tenantId: string,
    agentId: string
  ): Promise<Conversation | null> {
    const query = `
      UPDATE conversations
      SET handoff_agent_id = $1,
          status = 'handed_off'
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `;

    const result = await db.query<Conversation>(query, [
      agentId,
      conversationId,
      tenantId,
    ]);

    return result.rows[0] || null;
  }

  async updateLastMessageTime(conversationId: string): Promise<void> {
    const query = `
      UPDATE conversations
      SET last_message_at = NOW()
      WHERE id = $1
    `;

    await db.query(query, [conversationId]);
  }

  async expireInactiveConversations(
    inactivityMinutes: number
  ): Promise<number> {
    const query = `
      UPDATE conversations
      SET status = 'expired',
          ended_at = NOW()
      WHERE status = 'active'
        AND last_message_at < NOW() - INTERVAL '${inactivityMinutes} minutes'
      RETURNING id
    `;

    const result = await db.query(query);
    return result.rowCount || 0;
  }
}

export const conversationService = new ConversationService();

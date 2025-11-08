import { v4 as uuidv4 } from 'uuid';
import { db } from './database.service';
import { Message, CreateMessageDto } from '../types';
import { conversationService } from './conversation.service';

export class MessageService {
  async createMessage(dto: CreateMessageDto): Promise<Message> {
    const query = `
      INSERT INTO messages (
        id, conversation_id, sender_type, sender_id, content,
        whatsapp_message_id, timestamp, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      RETURNING *
    `;

    const values = [
      uuidv4(),
      dto.conversation_id,
      dto.sender_type,
      dto.sender_id || null,
      dto.content,
      dto.whatsapp_message_id || null,
      dto.metadata ? JSON.stringify(dto.metadata) : null,
    ];

    const result = await db.query<Message>(query, values);
    const message = result.rows[0];

    // Update conversation's last_message_at
    await conversationService.updateLastMessageTime(dto.conversation_id);

    return message;
  }

  async getMessagesByConversation(
    conversationId: string,
    limit: number = 50
  ): Promise<Message[]> {
    const query = `
      SELECT * FROM messages
      WHERE conversation_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    const result = await db.query<Message>(query, [conversationId, limit]);
    return result.rows.reverse(); // Return oldest first
  }

  async getRecentMessages(
    conversationId: string,
    count: number = 4
  ): Promise<Message[]> {
    const query = `
      SELECT * FROM messages
      WHERE conversation_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    const result = await db.query<Message>(query, [conversationId, count]);
    return result.rows.reverse(); // Return oldest first for context
  }

  async getMessage(messageId: string): Promise<Message | null> {
    const query = `SELECT * FROM messages WHERE id = $1`;
    const result = await db.query<Message>(query, [messageId]);
    return result.rows[0] || null;
  }

  async getMessagesByWhatsAppId(
    whatsappMessageId: string
  ): Promise<Message | null> {
    const query = `
      SELECT * FROM messages
      WHERE whatsapp_message_id = $1
    `;

    const result = await db.query<Message>(query, [whatsappMessageId]);
    return result.rows[0] || null;
  }

  async deleteOldMessages(olderThanMonths: number = 3): Promise<number> {
    const query = `
      DELETE FROM messages
      WHERE timestamp < NOW() - INTERVAL '${olderThanMonths} months'
      RETURNING id
    `;

    const result = await db.query(query);
    return result.rowCount || 0;
  }
}

export const messageService = new MessageService();

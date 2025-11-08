export interface Conversation {
  id: string;
  tenant_id: string;
  outlet_id: string;
  customer_phone: string;
  customer_name: string | null;
  status: 'active' | 'resolved' | 'handed_off' | 'expired';
  handoff_requested: boolean;
  handoff_agent_id: string | null;
  handoff_reason: string | null;
  started_at: Date;
  ended_at: Date | null;
  last_message_at: Date | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'customer' | 'llm' | 'agent';
  sender_id: string | null;
  content: string;
  whatsapp_message_id: string | null;
  timestamp: Date;
  metadata: Record<string, any> | null;
}

export interface CreateConversationDto {
  tenant_id: string;
  outlet_id: string;
  customer_phone: string;
  customer_name?: string;
}

export interface CreateMessageDto {
  conversation_id: string;
  sender_type: 'customer' | 'llm' | 'agent';
  sender_id?: string;
  content: string;
  whatsapp_message_id?: string;
  metadata?: Record<string, any>;
}

export interface HandoffRequest {
  conversation_id: string;
  reason: string;
  agent_id?: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export interface WebSocketEvents {
  'conversation:new': (data: Conversation) => void;
  'conversation:message': (data: Message) => void;
  'conversation:handoff': (data: HandoffRequest) => void;
  'conversation:resolved': (data: { conversation_id: string }) => void;
  'agent:join': (data: { conversation_id: string }) => void;
  'agent:leave': (data: { conversation_id: string }) => void;
}

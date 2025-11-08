// Common types
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// Tenant types
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'inactive';
  createdAt: string;
  updatedAt: string;
  llmInstructions?: string; // Custom instructions for LLM behavior
}

export interface Outlet {
  id: string;
  tenantId: string;
  name: string;
  wabaPhoneNumber: string;
  wabaPhoneNumberId: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

// Conversation types
export interface Conversation {
  id: string;
  tenantId: string;
  outletId: string;
  customerPhone: string;
  customerName?: string;
  status: 'active' | 'resolved' | 'handed_off' | 'expired';
  handoffRequested: boolean;
  handoffAgentId?: string;
  startedAt: string;
  endedAt?: string;
  lastMessageAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderType: 'customer' | 'llm' | 'agent';
  senderId?: string;
  content: string;
  whatsappMessageId?: string;
  timestamp: string;
  metadata?: {
    llmModel?: string;
    tokensUsed?: number;
    ragContextUsed?: boolean;
  };
}

// Knowledge types
export interface KnowledgeBase {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  knowledgeBaseId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  chunkCount?: number;
  uploadedAt: string;
}

// Analytics types
export interface ConversationMetrics {
  date: string;
  totalConversations: number;
  activeConversations: number;
  resolvedConversations: number;
  handedOffConversations: number;
  averageDurationMinutes: number;
  resolutionRate: number;
}

export interface MessageMetrics {
  date: string;
  totalMessages: number;
  customerMessages: number;
  llmMessages: number;
  agentMessages: number;
  averageResponseTimeSeconds: number;
}

export interface CostMetrics {
  date: string;
  totalLlmCalls: number;
  totalTokensUsed: number;
  totalLlmCost: number;
  totalWhatsappCost: number;
  totalCost: number;
  costPerConversation: number;
}

export interface DashboardMetrics {
  tenantId: string;
  outletId?: string;
  periodStart: string;
  periodEnd: string;
  conversations: ConversationMetrics[];
  messages: MessageMetrics[];
  costs: CostMetrics[];
}

export interface TenantSummary {
  tenantId: string;
  tenantName: string;
  periodStart: string;
  periodEnd: string;
  totalConversations: number;
  totalMessages: number;
  averageResponseTimeSeconds: number;
  resolutionRate: number;
  handoffRate: number;
  totalCost: number;
}

// Billing types
export interface QuotaStatus {
  tenantId: string;
  tier: 'starter' | 'growth' | 'enterprise';
  messageQuota: number;
  messagesUsed: number;
  percentageUsed: number;
  canSendMessage: boolean;
  resetDate: string;
}

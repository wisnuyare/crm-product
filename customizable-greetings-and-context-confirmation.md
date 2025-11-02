# Feature Specification: Customizable Greetings & LLM Context Confirmation

**Version**: 1.0.0  
**Last Updated**: October 30, 2025  
**Status**: Design Phase

---

## Table of Contents

1. [Feature 1: Customizable Greetings](#feature-1-customizable-greetings)
2. [Feature 2: LLM Context Confirmation](#feature-2-llm-context-confirmation)
3. [Implementation Plan](#implementation-plan)
4. [Testing Strategy](#testing-strategy)

---

## Feature 1: Customizable Greetings

### Overview

Each tenant/outlet can customize the initial greeting message sent when a customer starts a WhatsApp conversation. This personalizes the customer experience and sets the tone for the interaction.

### Requirements

**Functional Requirements**:
- FR1: Tenants can set a custom greeting message per outlet
- FR2: Greetings support emoji and basic formatting
- FR3: Greetings have a maximum length of 500 characters
- FR4: Greetings are sent automatically when a new conversation starts
- FR5: Tenants can preview greeting before saving
- FR6: Default greeting provided if none is set
- FR7: Greeting can include dynamic variables (time of day, customer name)

**Non-Functional Requirements**:
- NFR1: Greeting must be sanitized to prevent XSS attacks
- NFR2: Greeting changes take effect immediately (no caching issues)
- NFR3: Greeting delivery must be < 2 seconds after customer initiates chat

### Database Schema

Already implemented in Tenant Service:

```sql
ALTER TABLE outlets ADD COLUMN greeting_message TEXT;
ALTER TABLE outlets ADD COLUMN greeting_variables JSONB DEFAULT '{}';

-- Example greeting_variables:
-- {
--   "include_time": true,
--   "include_customer_name": true,
--   "business_hours_only": false
-- }
```

### API Specification

#### 1. Get Outlet Greeting

```http
GET /api/v1/tenants/:tenantId/outlets/:outletId/greeting

Response 200:
{
  "outletId": "uuid",
  "greetingMessage": "Welcome to Pizza Paradise! 🍕 How can we help you today?",
  "greetingVariables": {
    "include_time": true,
    "include_customer_name": false
  },
  "preview": "Good morning! Welcome to Pizza Paradise! 🍕 How can we help you today?"
}
```

#### 2. Update Outlet Greeting

```http
PUT /api/v1/tenants/:tenantId/outlets/:outletId/greeting

Request Body:
{
  "greetingMessage": "Hi there! {{greeting}} Welcome to {{business_name}}. {{question}}",
  "greetingVariables": {
    "include_time": true,
    "include_customer_name": true,
    "business_hours_only": false
  }
}

Response 200:
{
  "outletId": "uuid",
  "greetingMessage": "Updated successfully",
  "preview": "Good afternoon, John! Welcome to Pizza Paradise. How can we assist you?"
}

Response 400:
{
  "error": "Validation failed",
  "details": [
    "Greeting message exceeds 500 characters",
    "Invalid variable: {{invalid_var}}"
  ]
}
```

### Greeting Template Variables

Supported dynamic variables:

```javascript
const GREETING_VARIABLES = {
  // Time-based
  '{{greeting}}': () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  },
  
  // Customer info (if available from WhatsApp profile)
  '{{customer_name}}': (context) => context.customerName || 'there',
  '{{customer_first_name}}': (context) => context.customerName?.split(' ')[0] || 'there',
  
  // Business info
  '{{business_name}}': (context) => context.outlet.name,
  '{{outlet_name}}': (context) => context.outlet.name,
  
  // Contextual
  '{{question}}': () => 'How can we help you today?',
  '{{today}}': () => new Date().toLocaleDateString('id-ID', { weekday: 'long' }),
};
```

### Implementation (Tenant Service)

#### Update `outlets.service.ts`:

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class OutletsService {
  constructor(private prisma: PrismaService) {}
  
  async updateGreeting(
    tenantId: string,
    outletId: string,
    greetingMessage: string,
    greetingVariables?: any,
  ) {
    // Validate greeting length
    if (greetingMessage.length > 500) {
      throw new BadRequestException('Greeting message exceeds 500 characters');
    }
    
    // Sanitize message (remove HTML tags, scripts)
    const sanitizedMessage = this.sanitizeGreeting(greetingMessage);
    
    // Validate template variables
    this.validateTemplateVariables(sanitizedMessage);
    
    // Update database
    const outlet = await this.prisma.outlet.update({
      where: {
        id: outletId,
        tenantId, // Ensure tenant isolation
      },
      data: {
        greetingMessage: sanitizedMessage,
        greetingVariables: greetingVariables || {},
        updatedAt: new Date(),
      },
    });
    
    // Generate preview
    const preview = this.renderGreeting(outlet, {
      customerName: 'John Doe',
      time: new Date(),
    });
    
    return {
      outletId: outlet.id,
      greetingMessage: outlet.greetingMessage,
      greetingVariables: outlet.greetingVariables,
      preview,
    };
  }
  
  private sanitizeGreeting(message: string): string {
    // Remove HTML tags
    let sanitized = message.replace(/<[^>]*>/g, '');
    
    // Remove script content
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    return sanitized;
  }
  
  private validateTemplateVariables(message: string) {
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const matches = message.matchAll(variablePattern);
    
    const validVariables = [
      'greeting', 'customer_name', 'customer_first_name',
      'business_name', 'outlet_name', 'question', 'today'
    ];
    
    for (const match of matches) {
      const variable = match[1].trim();
      if (!validVariables.includes(variable)) {
        throw new BadRequestException(`Invalid template variable: {{${variable}}}`);
      }
    }
  }
  
  renderGreeting(outlet: any, context: any): string {
    let message = outlet.greetingMessage || 'Welcome! How can we help you?';
    
    // Replace variables
    const variables = {
      '{{greeting}}': this.getTimeBasedGreeting(),
      '{{customer_name}}': context.customerName || 'there',
      '{{customer_first_name}}': context.customerName?.split(' ')[0] || 'there',
      '{{business_name}}': outlet.name,
      '{{outlet_name}}': outlet.name,
      '{{question}}': 'How can we help you today?',
      '{{today}}': new Date().toLocaleDateString('id-ID', { weekday: 'long' }),
    };
    
    for (const [variable, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(variable, 'g'), value);
    }
    
    return message;
  }
  
  private getTimeBasedGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }
}
```

### Implementation (Conversation Service)

When a new conversation starts, send the greeting:

```typescript
// conversation-service/src/conversations/conversations.service.ts

import { Injectable } from '@nestjs/common';
import { PubSubService } from '../pubsub/pubsub.service';

@Injectable()
export class ConversationsService {
  constructor(
    private pubsub: PubSubService,
    private prisma: PrismaService,
  ) {}
  
  async handleNewConversation(
    customerPhone: string,
    outletId: string,
  ) {
    // Fetch outlet with greeting
    const outlet = await this.getOutletWithGreeting(outletId);
    
    // Get customer info from WhatsApp profile (if available)
    const customerName = await this.getCustomerName(customerPhone);
    
    // Render greeting with context
    const greetingMessage = this.renderGreeting(outlet, {
      customerName,
      time: new Date(),
    });
    
    // Create conversation record
    const conversation = await this.prisma.conversation.create({
      data: {
        tenantId: outlet.tenantId,
        outletId: outlet.id,
        customerPhone,
        customerName,
        status: 'active',
        startedAt: new Date(),
      },
    });
    
    // Publish greeting message to message-sender-service
    await this.pubsub.publish('whatsapp.outgoing.messages', {
      conversationId: conversation.id,
      outletId: outlet.id,
      to: customerPhone,
      message: greetingMessage,
      messageType: 'greeting',
    });
    
    return conversation;
  }
  
  private renderGreeting(outlet: any, context: any): string {
    // Same logic as Tenant Service
    // Or call Tenant Service API to render
    return outlet.greetingMessage || 'Welcome! How can we help you?';
  }
}
```

### Dashboard UI (React Component)

```tsx
// frontend/src/components/GreetingEditor.tsx

import React, { useState, useEffect } from 'react';

interface GreetingEditorProps {
  tenantId: string;
  outletId: string;
}

export const GreetingEditor: React.FC<GreetingEditorProps> = ({
  tenantId,
  outletId,
}) => {
  const [greeting, setGreeting] = useState('');
  const [preview, setPreview] = useState('');
  const [includeTime, setIncludeTime] = useState(true);
  const [includeCustomerName, setIncludeCustomerName] = useState(false);
  
  const maxLength = 500;
  const remainingChars = maxLength - greeting.length;
  
  useEffect(() => {
    // Fetch current greeting
    fetchGreeting();
  }, [tenantId, outletId]);
  
  const fetchGreeting = async () => {
    const response = await fetch(
      `/api/v1/tenants/${tenantId}/outlets/${outletId}/greeting`,
      {
        headers: {
          'Authorization': `Bearer ${getToken()}`,
        },
      }
    );
    const data = await response.json();
    setGreeting(data.greetingMessage);
    setPreview(data.preview);
  };
  
  const handleSave = async () => {
    const response = await fetch(
      `/api/v1/tenants/${tenantId}/outlets/${outletId}/greeting`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          greetingMessage: greeting,
          greetingVariables: {
            include_time: includeTime,
            include_customer_name: includeCustomerName,
          },
        }),
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      setPreview(data.preview);
      alert('Greeting updated successfully!');
    } else {
      const error = await response.json();
      alert(`Error: ${error.details?.join(', ')}`);
    }
  };
  
  return (
    <div className="greeting-editor">
      <h3>Customize Greeting Message</h3>
      
      <div className="editor-section">
        <label>Greeting Message</label>
        <textarea
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          maxLength={maxLength}
          rows={5}
          placeholder="Enter your greeting message..."
        />
        <div className={`char-count ${remainingChars < 50 ? 'warning' : ''}`}>
          {remainingChars} characters remaining
        </div>
      </div>
      
      <div className="options-section">
        <h4>Dynamic Variables</h4>
        <label>
          <input
            type="checkbox"
            checked={includeTime}
            onChange={(e) => setIncludeTime(e.target.checked)}
          />
          Include time-based greeting (Good morning/afternoon/evening)
        </label>
        <label>
          <input
            type="checkbox"
            checked={includeCustomerName}
            onChange={(e) => setIncludeCustomerName(e.target.checked)}
          />
          Include customer name (if available)
        </label>
      </div>
      
      <div className="variables-help">
        <h4>Available Variables</h4>
        <ul>
          <li><code>{'{{greeting}}'}</code> - Time-based greeting</li>
          <li><code>{'{{customer_name}}'}</code> - Customer's full name</li>
          <li><code>{'{{customer_first_name}}'}</code> - Customer's first name</li>
          <li><code>{'{{business_name}}'}</code> - Your business name</li>
          <li><code>{'{{question}}'}</code> - "How can we help you?"</li>
          <li><code>{'{{today}}'}</code> - Current day of week</li>
        </ul>
      </div>
      
      <div className="preview-section">
        <h4>Preview</h4>
        <div className="preview-box">
          {preview || 'Enter a greeting message to see preview...'}
        </div>
      </div>
      
      <button onClick={handleSave} className="btn-primary">
        Save Greeting
      </button>
    </div>
  );
};
```

---

## Feature 2: LLM Context Confirmation

### Overview

When the RAG system retrieves insufficient context (low confidence score), the LLM should acknowledge the knowledge gap and ask clarifying questions instead of providing potentially inaccurate answers.

### Requirements

**Functional Requirements**:
- FR1: RAG system assigns confidence scores to retrieved context
- FR2: LLM detects low-confidence scenarios (score < 0.7)
- FR3: LLM asks 1-2 specific clarifying questions
- FR4: Customer's clarification is used to enhance the next query
- FR5: Conversation state tracks "awaiting_clarification" status
- FR6: LLM can suggest alternative resources (website, phone number)
- FR7: After 2 failed attempts, offer human handoff

**Non-Functional Requirements**:
- NFR1: Confidence scoring must be < 100ms overhead
- NFR2: Clarifying questions must be contextually relevant
- NFR3: System must avoid repetitive clarification loops

### Architecture

```
Customer Query
      ↓
[Conversation Service] → Generate embedding
      ↓
[Knowledge Service] → RAG Search with confidence scoring
      ↓
    ┌─────────────────┐
    │ Confidence ≥ 0.7? │
    └─────────────────┘
      ↓          ↓
    YES         NO
      ↓          ↓
[Normal      [Clarification
 Response]    Request]
      ↓          ↓
      ↓    Store state:
      ↓    awaiting_clarification
      ↓          ↓
      └──────────┘
      ↓
[Message Sender] → WhatsApp
```

### Confidence Scoring (Knowledge Service)

```python
# knowledge-service/app/services/rag_service.py

from typing import List, Dict
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

class RAGService:
    def __init__(self, qdrant_client: QdrantClient):
        self.qdrant = qdrant_client
        self.confidence_threshold = 0.7
    
    async def retrieve_context(
        self,
        query_embedding: List[float],
        tenant_id: str,
        kb_ids: List[str],
        top_k: int = 5,
    ) -> Dict:
        """
        Retrieve context with confidence scoring.
        
        Returns:
            {
                "contexts": List of retrieved chunks,
                "confidence": float (0-1),
                "has_sufficient_context": bool,
                "retrieval_quality": str ("high", "medium", "low"),
            }
        """
        # Build filter for multi-tenancy
        search_filter = Filter(
            must=[
                FieldCondition(
                    key="tenant_id",
                    match=MatchValue(value=tenant_id)
                ),
                FieldCondition(
                    key="kb_id",
                    match=MatchValue(any=kb_ids)
                ),
            ]
        )
        
        # Search with score
        results = self.qdrant.search(
            collection_name="knowledge",
            query_vector=query_embedding,
            query_filter=search_filter,
            limit=top_k,
            score_threshold=0.5,  # Minimum threshold
        )
        
        # Calculate confidence metrics
        if not results:
            return {
                "contexts": [],
                "confidence": 0.0,
                "has_sufficient_context": False,
                "retrieval_quality": "none",
                "reason": "no_relevant_documents",
            }
        
        # Top result score
        top_score = results[0].score
        
        # Average score of top 3
        avg_top3_score = sum(r.score for r in results[:3]) / min(3, len(results))
        
        # Score distribution (measure consistency)
        scores = [r.score for r in results]
        score_std = self._calculate_std(scores)
        
        # Final confidence (weighted combination)
        confidence = (
            0.5 * top_score +           # Top result quality
            0.3 * avg_top3_score +      # Average quality
            0.2 * (1 - score_std)       # Consistency bonus
        )
        
        # Determine retrieval quality
        if confidence >= 0.8:
            quality = "high"
        elif confidence >= 0.6:
            quality = "medium"
        else:
            quality = "low"
        
        return {
            "contexts": [
                {
                    "text": r.payload["chunk_text"],
                    "score": r.score,
                    "metadata": r.payload.get("metadata", {}),
                }
                for r in results
            ],
            "confidence": round(confidence, 3),
            "has_sufficient_context": confidence >= self.confidence_threshold,
            "retrieval_quality": quality,
            "top_score": round(top_score, 3),
            "num_results": len(results),
        }
    
    def _calculate_std(self, scores: List[float]) -> float:
        """Calculate standard deviation of scores."""
        if len(scores) < 2:
            return 0.0
        mean = sum(scores) / len(scores)
        variance = sum((x - mean) ** 2 for x in scores) / len(scores)
        return variance ** 0.5
```

### LLM Orchestration with Context Confirmation

```python
# llm-orchestration-service/app/services/llm_service.py

from typing import Dict, Optional
from openai import AsyncOpenAI

class LLMService:
    def __init__(self):
        self.client = AsyncOpenAI()
        self.model = "gpt-4o-mini"
    
    async def generate_response(
        self,
        user_message: str,
        rag_context: Dict,
        conversation_history: List[Dict],
        tenant_config: Dict,
    ) -> Dict:
        """
        Generate response with context confirmation.
        """
        # Check if we have sufficient context
        if not rag_context["has_sufficient_context"]:
            return await self._generate_clarification(
                user_message,
                rag_context,
                tenant_config,
            )
        else:
            return await self._generate_answer(
                user_message,
                rag_context,
                conversation_history,
                tenant_config,
            )
    
    async def _generate_clarification(
        self,
        user_message: str,
        rag_context: Dict,
        tenant_config: Dict,
    ) -> Dict:
        """
        Generate clarifying questions when context is insufficient.
        """
        tone = tenant_config.get("llm_tone", {}).get("tone", "professional")
        
        # Build prompt for clarification
        system_prompt = f"""
        You are a helpful customer service assistant with a {tone} tone.
        
        IMPORTANT: You don't have enough information to answer the customer's question confidently.
        
        Your task:
        1. Acknowledge their question politely
        2. Explain briefly that you need more details
        3. Ask 1-2 SPECIFIC clarifying questions
        4. Be concise and friendly
        
        DO NOT:
        - Guess or make up information
        - Give vague or uncertain answers
        - Ask more than 2 questions
        - Apologize excessively
        
        Available context (low confidence {rag_context['confidence']}):
        {self._format_context(rag_context['contexts'][:2])}
        """
        
        user_prompt = f"""
        Customer question: {user_message}
        
        Generate a clarifying response.
        """
        
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=150,
        )
        
        clarification_text = response.choices[0].message.content
        
        return {
            "type": "clarification",
            "message": clarification_text,
            "confidence": rag_context["confidence"],
            "requires_clarification": True,
            "suggested_clarifications": self._extract_questions(clarification_text),
            "metadata": {
                "retrieval_quality": rag_context["retrieval_quality"],
                "num_contexts": len(rag_context["contexts"]),
            }
        }
    
    async def _generate_answer(
        self,
        user_message: str,
        rag_context: Dict,
        conversation_history: List[Dict],
        tenant_config: Dict,
    ) -> Dict:
        """
        Generate normal answer with sufficient context.
        """
        tone = tenant_config.get("llm_tone", {}).get("tone", "professional")
        custom_instructions = tenant_config.get("llm_tone", {}).get(
            "customInstructions", ""
        )
        
        system_prompt = f"""
        You are a helpful customer service assistant with a {tone} tone.
        
        {custom_instructions}
        
        Use the following context to answer the customer's question:
        
        {self._format_context(rag_context['contexts'])}
        
        Guidelines:
        - Answer based ONLY on the provided context
        - Be concise but complete
        - If the context doesn't fully answer, say so and ask clarifying questions
        - Maintain a {tone} tone
        """
        
        # Build conversation history
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add recent conversation history (last 3-4 exchanges)
        for msg in conversation_history[-6:]:
            messages.append({
                "role": "user" if msg["sender_type"] == "customer" else "assistant",
                "content": msg["content"],
            })
        
        # Add current message
        messages.append({"role": "user", "content": user_message})
        
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.7,
            max_tokens=300,
        )
        
        answer_text = response.choices[0].message.content
        
        return {
            "type": "answer",
            "message": answer_text,
            "confidence": rag_context["confidence"],
            "requires_clarification": False,
            "metadata": {
                "retrieval_quality": rag_context["retrieval_quality"],
                "num_contexts": len(rag_context["contexts"]),
                "tokens_used": response.usage.total_tokens,
            }
        }
    
    def _format_context(self, contexts: List[Dict]) -> str:
        """Format contexts for prompt."""
        formatted = []
        for i, ctx in enumerate(contexts, 1):
            formatted.append(f"[Context {i}] (confidence: {ctx['score']:.2f})")
            formatted.append(ctx["text"])
            formatted.append("")
        return "\n".join(formatted)
    
    def _extract_questions(self, text: str) -> List[str]:
        """Extract questions from clarification response."""
        import re
        # Find sentences ending with ?
        questions = re.findall(r'([^.!?]*\?)', text)
        return [q.strip() for q in questions]
```

### Conversation State Management

```typescript
// conversation-service/src/conversations/conversations.service.ts

export enum ConversationState {
  ACTIVE = 'active',
  AWAITING_CLARIFICATION = 'awaiting_clarification',
  RESOLVED = 'resolved',
  HANDED_OFF = 'handed_off',
}

export class ConversationsService {
  async processMessage(
    conversationId: string,
    customerMessage: string,
  ) {
    const conversation = await this.getConversation(conversationId);
    
    // Check if we're awaiting clarification
    if (conversation.state === ConversationState.AWAITING_CLARIFICATION) {
      // Use clarification to enhance query
      return await this.processWithClarification(
        conversation,
        customerMessage,
      );
    }
    
    // Normal flow
    const llmResponse = await this.llmService.generate(
      customerMessage,
      conversation.tenantId,
      conversation.knowledgeBaseIds,
    );
    
    // Update conversation state
    if (llmResponse.requires_clarification) {
      await this.updateConversationState(
        conversationId,
        ConversationState.AWAITING_CLARIFICATION,
        {
          original_query: customerMessage,
          clarification_attempt: (conversation.metadata?.clarification_attempt || 0) + 1,
        }
      );
      
      // Check if too many clarification attempts
      if ((conversation.metadata?.clarification_attempt || 0) >= 2) {
        // Offer human handoff
        return {
          message: llmResponse.message + "\n\nWould you like to speak with a human agent?",
          suggest_handoff: true,
        };
      }
    } else {
      // Reset state
      await this.updateConversationState(
        conversationId,
        ConversationState.ACTIVE,
        { clarification_attempt: 0 }
      );
    }
    
    return llmResponse;
  }
  
  async processWithClarification(
    conversation: any,
    clarification: string,
  ) {
    const originalQuery = conversation.metadata?.original_query;
    
    // Enhanced query = original + clarification
    const enhancedQuery = `${originalQuery}. Additional context: ${clarification}`;
    
    // Re-run RAG with enhanced query
    const llmResponse = await this.llmService.generate(
      enhancedQuery,
      conversation.tenantId,
      conversation.knowledgeBaseIds,
    );
    
    // Reset state
    await this.updateConversationState(
      conversation.id,
      ConversationState.ACTIVE,
      { clarification_attempt: 0 }
    );
    
    return llmResponse;
  }
}
```

---

## Implementation Plan

### Phase 1: Customizable Greetings (Week 1)

**Tasks**:
1. ✅ Add greeting columns to outlets table (already done in schema)
2. Implement greeting CRUD in Tenant Service
3. Add sanitization and validation
4. Implement template variable rendering
5. Create greeting editor UI component
6. Add preview functionality
7. Test greeting delivery in Conversation Service

**Testing**:
- Unit tests for sanitization
- Unit tests for template rendering
- Integration test for API endpoints
- E2E test for greeting delivery
- UI testing with various greeting lengths

**Estimated Time**: 3-4 days

### Phase 2: LLM Context Confirmation (Week 2-3)

**Tasks**:
1. Implement confidence scoring in Knowledge Service RAG
2. Add context confirmation logic to LLM Orchestration Service
3. Update Conversation Service to handle clarification state
4. Create clarification prompt templates
5. Implement enhanced query after clarification
6. Add handoff trigger after 2 failed clarifications
7. Add analytics for clarification success rate

**Testing**:
- Unit tests for confidence calculation
- Unit tests for clarification generation
- Integration test for full clarification flow
- E2E test with low-confidence scenarios
- Performance test for confidence scoring overhead

**Estimated Time**: 7-10 days

### Phase 3: Dashboard & Monitoring (Week 4)

**Tasks**:
1. Add greeting analytics (greeting sent count, edit frequency)
2. Add clarification metrics (clarification rate, success rate)
3. Create dashboard widgets
4. Add A/B testing for greeting variations (future)

**Estimated Time**: 3-5 days

---

## Testing Strategy

### Test Scenarios for Greetings

**Scenario 1: Simple Greeting**
```
Input: "Welcome to Pizza Palace! 🍕"
Expected: Delivered exactly as-is to new customer
```

**Scenario 2: Time-based Greeting**
```
Input: "{{greeting}} Welcome to Pizza Palace!"
Expected (morning): "Good morning! Welcome to Pizza Palace!"
Expected (evening): "Good evening! Welcome to Pizza Palace!"
```

**Scenario 3: Customer Name**
```
Input: "Hi {{customer_first_name}}! Welcome back!"
Customer: John Doe
Expected: "Hi John! Welcome back!"
```

**Scenario 4: Sanitization**
```
Input: "<script>alert('xss')</script>Hello!"
Expected: "Hello!" (script removed)
```

**Scenario 5: Length Validation**
```
Input: 600 character message
Expected: 400 Bad Request - "Exceeds 500 character limit"
```

### Test Scenarios for Context Confirmation

**Scenario 1: High Confidence (0.85)**
```
Customer: "What are your opening hours?"
Context: Clear, specific hours in knowledge base
Expected: Direct answer with hours
```

**Scenario 2: Low Confidence (0.55)**
```
Customer: "Do you have vegetarian options?"
Context: Vague mentions of menu items
Expected: "I'd be happy to help! Are you looking for appetizers, mains, or desserts?"
```

**Scenario 3: No Context (0.0)**
```
Customer: "Can I get a refund?"
Context: No refund policy in knowledge base
Expected: "I want to help with your refund request. Could you tell me more about your order?"
```

**Scenario 4: Clarification Loop**
```
Customer: "What's good here?"
Bot: "What type of food are you in the mood for?"
Customer: "Something tasty"
Bot: "I'd love to help! Are you looking for pizza, pasta, or something else?"
Customer: "Pizza"
Bot: [Now provides pizza recommendations with high confidence]
```

**Scenario 5: Failed Clarification → Handoff**
```
Attempt 1: Clarification question
Customer: Vague response
Attempt 2: Another clarification
Customer: Still unclear
Attempt 3: "Would you like to speak with a human agent?"
```

---

## Monitoring & Analytics

### Metrics to Track

**Greeting Metrics**:
- `greeting_sent_total` (Counter)
- `greeting_edit_count` (Counter per tenant)
- `greeting_character_length` (Histogram)
- `greeting_variable_usage` (Counter per variable type)

**Context Confirmation Metrics**:
- `rag_confidence_score` (Histogram)
- `clarification_request_rate` (Gauge)
- `clarification_success_rate` (Gauge)
- `clarification_attempts_per_conversation` (Histogram)
- `handoff_after_clarification_rate` (Gauge)

### Alerts

- Alert if clarification rate > 40% (may indicate poor knowledge base)
- Alert if greeting delivery time > 5 seconds
- Alert if confidence score consistently < 0.6 for a tenant

---

## Future Enhancements

### Greetings
1. A/B testing different greeting variations
2. Scheduled greetings (different messages for business hours vs after hours)
3. Multilingual greetings based on customer language detection
4. Rich media greetings (images, videos, location)

### Context Confirmation
1. Semantic similarity between clarifications and customer response
2. Auto-suggest common clarifying questions from successful conversations
3. Learn from successful clarifications to improve confidence threshold
4. Proactive suggestions ("Are you asking about X or Y?")

---

## Conclusion

These two features significantly enhance the customer experience:

1. **Customizable Greetings** make each interaction feel personal and on-brand
2. **LLM Context Confirmation** ensures accuracy over speed, building customer trust

Both features are designed to be:
- ✅ Easy to implement (leverage existing architecture)
- ✅ Highly testable (clear success criteria)
- ✅ Measurable (comprehensive metrics)
- ✅ Extensible (foundation for future enhancements)

**Implementation Priority**: Start with greetings (simpler, immediate value), then add context confirmation (more complex, higher impact).

---

**Next Steps**: Review this specification, then proceed with implementation using Claude Code following the prompts in the [Quick Start Guide](./quickstart-guide.md).

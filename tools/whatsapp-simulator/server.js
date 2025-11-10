/**
 * WhatsApp Simulator - Mock webhook for testing E2E flows
 *
 * This server simulates WhatsApp's webhook behavior, allowing us to test
 * the full conversation flow without needing a real WhatsApp Business API account.
 *
 * Flow: UI → Mock Webhook → LLM Service → Functions → Services → Response
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 4000;

// Configuration - Update these based on your services
const CONFIG = {
  TENANT_ID: '00000000-0000-0000-0000-000000000001',
  LLM_SERVICE_URL: 'http://localhost:3005',
  CONVERSATION_SERVICE_URL: 'http://localhost:3004',
  BOOKING_SERVICE_URL: 'http://localhost:3008',
  ORDER_SERVICE_URL: 'http://localhost:3009'
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory conversation store (simulate conversation context)
const conversations = new Map();

/**
 * Get or create conversation
 */
function getOrCreateConversation(customerPhone) {
  // Use customer phone as key, but generate proper UUID for conversation
  const conversationKey = `conv_${customerPhone.replace(/[^0-9]/g, '')}`;

  if (!conversations.has(conversationKey)) {
    conversations.set(conversationKey, {
      id: uuidv4(), // Proper UUID for LLM service
      conversationKey: conversationKey,
      customerPhone,
      customerName: `Test Customer ${customerPhone}`,
      messages: [],
      createdAt: new Date().toISOString()
    });
  }

  return conversations.get(conversationKey);
}

/**
 * Main webhook endpoint - Simulates WhatsApp incoming message
 */
app.post('/webhook/message', async (req, res) => {
  try {
    const { customerPhone, message } = req.body;

    console.log('\n📱 Incoming WhatsApp Message:');
    console.log(`  From: ${customerPhone}`);
    console.log(`  Message: ${message}`);

    // Get or create conversation IN THE CONVERSATION SERVICE
    let conversationId;
    let customerName;

    // Try to find or create conversation via Conversation Service
    try {
      const findOrCreateResponse = await axios.post(
        `${CONFIG.CONVERSATION_SERVICE_URL}/api/v1/conversations/find-or-create`,
        {
          tenant_id: CONFIG.TENANT_ID,
          outlet_id: '7d0f2b8d-00ee-458a-b9b4-07e76671059f', // Default outlet for testing
          customer_phone: customerPhone,
          customer_name: `Test Customer ${customerPhone}`
        },
        {
          headers: {
            'X-Tenant-Id': CONFIG.TENANT_ID,
            'Content-Type': 'application/json'
          }
        }
      );

      conversationId = findOrCreateResponse.data.id;
      customerName = findOrCreateResponse.data.customer_name;
      console.log(`  Conversation ID: ${conversationId} (${findOrCreateResponse.data.status})`);

    } catch (error) {
      console.error('  Warning: Could not create conversation in Conversation Service');
      // Fallback to local conversation
      const localConv = getOrCreateConversation(customerPhone);
      conversationId = localConv.id;
      customerName = localConv.customerName;
    }

    // Store customer message in Conversation Service
    try {
      await axios.post(
        `${CONFIG.CONVERSATION_SERVICE_URL}/api/v1/messages`,
        {
          conversation_id: conversationId,
          sender_type: 'customer',
          content: message
        },
        {
          headers: {
            'X-Tenant-Id': CONFIG.TENANT_ID,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`  ✓ Customer message saved to Conversation Service`);
    } catch (error) {
      console.error('  Warning: Could not save message to Conversation Service');
    }

    // Call LLM Orchestration Service
    console.log('\n🤖 Calling LLM Service...');

    const llmResponse = await axios.post(
      `${CONFIG.LLM_SERVICE_URL}/api/v1/llm/generate`,
      {
        user_message: message,
        conversation_id: conversationId,
        knowledge_base_ids: [],
        max_tokens: 500,
        temperature: 0.7
      },
      {
        headers: {
          'X-Tenant-Id': CONFIG.TENANT_ID,
          'Content-Type': 'application/json'
        }
      }
    );

    const botResponse = llmResponse.data.response;
    const tokensUsed = llmResponse.data.tokens_used;
    const functionsExecuted = llmResponse.data.functions_executed || [];

    console.log('\n✅ LLM Response received:');
    console.log(`  Response: ${botResponse}`);
    console.log(`  Tokens: ${tokensUsed.total}`);
    console.log(`  Functions called: ${functionsExecuted.length}`);

    if (functionsExecuted.length > 0) {
      console.log('\n🔧 Functions Executed:');
      functionsExecuted.forEach(func => {
        console.log(`  - ${func.name}`);
        console.log(`    Args: ${JSON.stringify(func.arguments)}`);
        console.log(`    Result: ${func.result ? 'Success' : 'Failed'}`);
      });
    }

    // Store LLM response in Conversation Service
    try {
      await axios.post(
        `${CONFIG.CONVERSATION_SERVICE_URL}/api/v1/messages`,
        {
          conversation_id: conversationId,
          sender_type: 'llm',
          content: botResponse,
          metadata: {
            tokens_used: tokensUsed,
            functions_executed: functionsExecuted
          }
        },
        {
          headers: {
            'X-Tenant-Id': CONFIG.TENANT_ID,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`  ✓ LLM response saved to Conversation Service`);
    } catch (error) {
      console.error('  Warning: Could not save LLM response to Conversation Service');
    }

    // Also update local conversation store for backward compatibility
    const localConv = getOrCreateConversation(customerPhone);
    localConv.id = conversationId; // Use the real conversation ID
    localConv.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });
    localConv.messages.push({
      role: 'assistant',
      content: botResponse,
      timestamp: new Date().toISOString(),
      metadata: {
        tokensUsed,
        functionsExecuted
      }
    });

    // Return response to client
    res.json({
      success: true,
      conversationId: conversationId,
      response: botResponse,
      tokensUsed,
      functionsExecuted,
      messageCount: localConv.messages.length
    });

  } catch (error) {
    console.error('\n❌ Error processing message:', error.message);
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Data:', error.response.data);
    }

    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

/**
 * Get conversation history
 */
app.get('/conversations/:id', (req, res) => {
  const { id } = req.params;
  const conversation = conversations.get(id);

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  res.json(conversation);
});

/**
 * Get all conversations
 */
app.get('/conversations', (req, res) => {
  const allConversations = Array.from(conversations.values());
  res.json({
    total: allConversations.length,
    conversations: allConversations
  });
});

/**
 * Clear all conversations
 */
app.post('/conversations/clear', (req, res) => {
  const count = conversations.size;
  conversations.clear();
  res.json({
    success: true,
    message: `Cleared ${count} conversations`
  });
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'WhatsApp Simulator',
    version: '1.0.0',
    activeConversations: conversations.size,
    config: {
      llmServiceUrl: CONFIG.LLM_SERVICE_URL,
      tenantId: CONFIG.TENANT_ID
    }
  });
});

/**
 * Get test scenarios
 */
app.get('/api/test-scenarios', (req, res) => {
  const scenarios = require('./test-scenarios.json');
  res.json(scenarios);
});

/**
 * Run automated test scenario
 */
app.post('/api/test-scenario', async (req, res) => {
  const { scenarioName, messages } = req.body;
  const results = [];

  console.log(`\n🧪 Running Test Scenario: ${scenarioName}`);
  console.log(`  Messages: ${messages.length}`);

  const testPhone = `+628${Date.now().toString().slice(-9)}`;

  for (const msg of messages) {
    try {
      const response = await axios.post(
        'http://localhost:4000/webhook/message',
        {
          customerPhone: testPhone,
          message: msg.content
        }
      );

      results.push({
        message: msg.content,
        expected: msg.expected,
        response: response.data.response,
        success: true,
        functionsExecuted: response.data.functionsExecuted
      });

      // Wait between messages
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      results.push({
        message: msg.content,
        success: false,
        error: error.message
      });
    }
  }

  res.json({
    scenario: scenarioName,
    results,
    passed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n🚀 WhatsApp Simulator Started!');
  console.log(`\n📱 Server running on: http://localhost:${PORT}`);
  console.log(`\n🎯 Configuration:`);
  console.log(`  - Tenant ID: ${CONFIG.TENANT_ID}`);
  console.log(`  - LLM Service: ${CONFIG.LLM_SERVICE_URL}`);
  console.log(`\n💡 Open http://localhost:${PORT} in your browser to start testing`);
  console.log(`\n📚 Available endpoints:`);
  console.log(`  - POST /webhook/message - Send message`);
  console.log(`  - GET  /conversations - List all conversations`);
  console.log(`  - GET  /conversations/:id - Get conversation history`);
  console.log(`  - POST /conversations/clear - Clear all conversations`);
  console.log(`  - GET  /api/test-scenarios - Get test scenarios`);
  console.log(`  - POST /api/test-scenario - Run automated test`);
  console.log(`  - GET  /health - Health check`);
  console.log('\n');
});

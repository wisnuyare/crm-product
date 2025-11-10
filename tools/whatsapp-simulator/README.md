# WhatsApp Simulator - E2E Testing Tool

A mock WhatsApp webhook server for testing the full conversation flow without needing a real WhatsApp Business API account.

## Features

- ✅ Mock WhatsApp webhook endpoint
- ✅ Beautiful chat UI for testing
- ✅ Pre-defined test scenarios
- ✅ Real-time function call tracking
- ✅ Conversation history management
- ✅ Automated test scenario execution

## Flow

```
Simulator UI → Mock Webhook → LLM Orchestration → Functions → Services → Response
```

## Quick Start

### 1. Install Dependencies

```bash
cd tools/whatsapp-simulator
npm install
```

### 2. Ensure Services Are Running

Make sure these services are running:
- LLM Orchestration Service (port 3005)
- Booking Service (port 3008)
- Order Service (port 3009)
- Conversation Service (port 3004) - optional

```bash
cd infrastructure/docker
docker-compose up -d
```

### 3. Start the Simulator

```bash
npm start
```

The simulator will start on http://localhost:4000

### 4. Open in Browser

Navigate to http://localhost:4000 and start testing!

## Usage

### Manual Testing

1. Enter a phone number (default: +628123456789)
2. Type a message and click Send
3. Watch the conversation unfold
4. See function calls in real-time

### Pre-defined Scenarios

Click any scenario button on the left sidebar to auto-fill test messages:

- **🎾 Booking Test**: Tests availability check & booking creation
- **🛒 Order Test**: Tests product availability & order creation
- **📦 Stock Test**: Tests stock deduction & error handling
- **💬 Full Conversation**: Complete customer journey

### Test Messages

**Booking:**
- "Is the tennis court available tomorrow at 3pm?"
- "Book it for 2 hours under name John Doe"

**Ordering:**
- "Do you have chocolate cake?"
- "I want 2 chocolate cakes for Saturday"

**Stock Management:**
- "I want 20 chocolate cakes" (should fail - insufficient stock)

## API Endpoints

### POST /webhook/message
Send a message to the bot

**Request:**
```json
{
  "customerPhone": "+628123456789",
  "message": "Is the tennis court available?"
}
```

**Response:**
```json
{
  "success": true,
  "conversationId": "conv_8123456789",
  "response": "Let me check availability for you...",
  "tokensUsed": {
    "input": 150,
    "output": 75,
    "total": 225
  },
  "functionsExecuted": [
    {
      "name": "search_availability",
      "arguments": {...},
      "result": {...}
    }
  ]
}
```

### GET /conversations
List all active conversations

### GET /conversations/:id
Get conversation history

### POST /conversations/clear
Clear all conversations

### GET /api/test-scenarios
Get all test scenarios

### POST /api/test-scenario
Run automated test scenario

### GET /health
Health check

## Configuration

Edit `server.js` to configure:

```javascript
const CONFIG = {
  TENANT_ID: '00000000-0000-0000-0000-000000000001',
  LLM_SERVICE_URL: 'http://localhost:3005',
  CONVERSATION_SERVICE_URL: 'http://localhost:3004',
  BOOKING_SERVICE_URL: 'http://localhost:3008',
  ORDER_SERVICE_URL: 'http://localhost:3009'
};
```

## Test Scenarios

Located in `test-scenarios.json`:

1. **Booking - Happy Path**: Check availability → Create booking
2. **Order - Happy Path**: Check products → Place order
3. **Stock Management**: Test stock deduction and errors
4. **Mixed Conversation**: Both booking and ordering
5. **Full Customer Journey**: Complete conversation flow

## Troubleshooting

### "Failed to get response"
- Check that LLM Orchestration Service is running on port 3005
- Verify OpenAI API key is configured
- Check service logs: `docker-compose logs llm-orchestration-service`

### Function calls not executing
- Verify Booking Service (3008) and Order Service (3009) are running
- Check that database has sample data
- Review LLM service logs for errors

### Stock not deducting
- Verify Order Service is running
- Check database: `docker-compose exec postgres psql -U crm_user -d crm_dev`
- Query: `SELECT * FROM products WHERE name LIKE '%Chocolate%';`

## Development

### Run with auto-reload
```bash
npm run dev
```

### Add new test scenarios
Edit `test-scenarios.json` and add to the `scenarios` array

### Customize UI
Edit `public/index.html` - pure HTML/CSS/JS, no build step needed

## Architecture

- **Server**: Node.js/Express (port 4000)
- **Frontend**: Pure HTML/CSS/JS
- **Dependencies**: express, cors, uuid, axios
- **No build step**: Instant changes

## What Gets Tested

✅ LLM function calling (4 functions)
✅ Booking availability search
✅ Booking creation
✅ Product availability check
✅ Order creation
✅ Stock management
✅ Multi-turn conversations
✅ Error handling

## Next Steps

After testing with the simulator:
1. Verify bookings appear in `/bookings` page
2. Verify orders appear in `/orders` page
3. Check stock deduction in `/products` page
4. Test with real WhatsApp webhook

---

**Created for**: WhatsApp CRM E2E Testing
**Version**: 1.0.0
**Port**: 4000

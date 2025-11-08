import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import { config } from './config';
import { db } from './services/database.service';
import { initializeWebSocket } from './services/websocket.service';
import { conversationController } from './controllers/conversation.controller';
import { messageController } from './controllers/message.controller';

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize WebSocket
const wsService = initializeWebSocket(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database
    await db.query('SELECT 1');

    res.json({
      status: 'healthy',
      service: 'conversation-service',
      version: '1.0.0',
      database: 'connected',
      websocket: 'active',
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'conversation-service',
      error: error.message,
    });
  }
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'conversation-service',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      conversations: '/api/v1/conversations',
      messages: '/api/v1/messages',
    },
  });
});

// API Routes - Conversations
const router = express.Router();

// Conversation routes
router.post(
  '/conversations',
  conversationController.createConversation.bind(conversationController)
);

router.get(
  '/conversations/active',
  conversationController.getActiveConversations.bind(conversationController)
);

router.post(
  '/conversations/find-or-create',
  conversationController.findOrCreateConversation.bind(conversationController)
);

router.get(
  '/conversations/:id',
  conversationController.getConversation.bind(conversationController)
);

router.post(
  '/conversations/:id/handoff',
  conversationController.requestHandoff.bind(conversationController)
);

router.put(
  '/conversations/:id/assign',
  conversationController.assignAgent.bind(conversationController)
);

router.put(
  '/conversations/:id/status',
  conversationController.updateStatus.bind(conversationController)
);

// Message routes
router.post(
  '/messages',
  messageController.createMessage.bind(messageController)
);

router.get(
  '/conversations/:conversationId/messages',
  messageController.getMessages.bind(messageController)
);

router.get(
  '/conversations/:conversationId/messages/recent',
  messageController.getRecentMessages.bind(messageController)
);

// Mount API routes
app.use('/api/v1', router);

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
server.listen(config.port, () => {
  console.log(`
🚀 Conversation Service started
📡 HTTP Server: http://localhost:${config.port}
🔌 WebSocket Server: ws://localhost:${config.port}
📊 Environment: ${config.nodeEnv}
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    console.log('HTTP server closed');
    await db.close();
    console.log('Database connection closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(async () => {
    console.log('HTTP server closed');
    await db.close();
    console.log('Database connection closed');
    process.exit(0);
  });
});

export default app;

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3004', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'crm_dev',
    user: process.env.DB_USER || 'crm_user',
    password: process.env.DB_PASSWORD || 'crm_password',
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },

  // Firestore
  firestore: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    credentialsPath: process.env.FIREBASE_CREDENTIALS_PATH || '',
  },

  // Conversation settings
  conversation: {
    messageHistoryLimit: 4, // Last 4 messages for context
    inactivityTimeoutMinutes: 24 * 60, // 24 hours
    handoffKeywords: [
      'speak to human',
      'talk to agent',
      'representative',
      'escalate',
      'supervisor',
      'manager',
      'complaint',
      'human',
      'person',
    ],
  },
};

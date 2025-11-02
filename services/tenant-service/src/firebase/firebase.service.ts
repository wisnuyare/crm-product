import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    try {
      const projectId = this.configService.get('FIREBASE_PROJECT_ID');
      const privateKey = this.configService.get('FIREBASE_PRIVATE_KEY');
      const clientEmail = this.configService.get('FIREBASE_CLIENT_EMAIL');

      if (!projectId || !privateKey || !clientEmail) {
        this.logger.warn(
          '⚠️  Firebase credentials not configured. Auth middleware will be disabled.',
        );
        return;
      }

      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          privateKey: privateKey.replace(/\\n/g, '\n'),
          clientEmail,
        }),
      });

      this.logger.log('✅ Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
      throw error;
    }
  }

  getAuth(): admin.auth.Auth {
    if (!this.app) {
      throw new Error('Firebase Admin not initialized');
    }
    return this.app.auth();
  }

  /**
   * Verify Firebase ID token
   */
  async verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken> {
    try {
      const decodedToken = await this.getAuth().verifyIdToken(token);
      return decodedToken;
    } catch (error) {
      this.logger.error('Token verification failed:', error.message);
      throw error;
    }
  }

  /**
   * Get user by UID
   */
  async getUser(uid: string): Promise<admin.auth.UserRecord> {
    return await this.getAuth().getUser(uid);
  }

  /**
   * Set custom user claims (for tenant_id, role, etc.)
   */
  async setCustomClaims(uid: string, claims: Record<string, any>): Promise<void> {
    await this.getAuth().setCustomUserClaims(uid, claims);
    this.logger.log(`Custom claims set for user ${uid}:`, claims);
  }

  /**
   * Create a new user
   */
  async createUser(email: string, password: string): Promise<admin.auth.UserRecord> {
    return await this.getAuth().createUser({
      email,
      password,
      emailVerified: false,
    });
  }

  /**
   * Delete user
   */
  async deleteUser(uid: string): Promise<void> {
    await this.getAuth().deleteUser(uid);
  }

  /**
   * Generate custom token (for testing)
   */
  async createCustomToken(uid: string, claims?: Record<string, any>): Promise<string> {
    return await this.getAuth().createCustomToken(uid, claims);
  }
}

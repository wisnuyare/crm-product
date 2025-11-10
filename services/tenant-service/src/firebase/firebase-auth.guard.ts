import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirebaseService } from './firebase.service';

export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(private firebaseService: FirebaseService, private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // DEVELOPMENT MODE: Bypass auth if Firebase is not configured
    if (!this.firebaseService.isConfigured()) {
      this.logger.warn('⚠️  Firebase not configured - bypassing authentication (DEV MODE)');
      const request = context.switchToHttp().getRequest();

      // Mock user for development
      request.user = {
        uid: '00000000-0000-0000-0000-000000000001',
        email: 'dev@example.com',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        role: 'admin',
      };

      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    try {
      const decodedToken = await this.firebaseService.verifyIdToken(token);

      // Attach decoded token to request
      request.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        tenantId: decodedToken.tenant_id,
        role: decodedToken.role || 'viewer',
        firebaseToken: decodedToken,
      };

      return true;
    } catch (error) {
      this.logger.error('Authentication failed:', error.message);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

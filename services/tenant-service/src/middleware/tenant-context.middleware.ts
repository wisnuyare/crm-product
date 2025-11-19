import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../database/database.service';

/**
 * Tenant Context Middleware
 *
 * Sets the PostgreSQL session variable `app.current_tenant_id` to enforce
 * Row-Level Security (RLS) policies for multi-tenant isolation.
 *
 * This middleware MUST run after FirebaseAuthGuard so that request.user
 * is populated with the authenticated user's tenant_id.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(private readonly db: DatabaseService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Skip if no user (public route)
    let tenantId = (req as any).user?.tenantId;

    // For local development, if user is not authenticated, try to get tenantId from header
    if (!tenantId) {
      tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) {
        next();
        return;
      }
    }

    try {
      // Validate tenant ID is a valid UUID to prevent SQL injection
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(tenantId)) {
        this.logger.warn(`Invalid tenant ID format: ${tenantId}`);
        next();
        return;
      }

      // Set PostgreSQL session variable for Row-Level Security
      // Note: SET LOCAL doesn't support parameterized queries, so we use string interpolation
      // Safe because we validated UUID format above
      await this.db.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);

      this.logger.debug(`Tenant context set: ${tenantId}`);

      next();
    } catch (error) {
      this.logger.error(`Failed to set tenant context: ${error.message}`);
      // Continue anyway - RLS will just return no data if context not set
      next();
    }
  }
}

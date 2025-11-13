import { Controller, Get } from '@nestjs/common';
import { Public } from './firebase/decorators';
import { DatabaseService } from './database/database.service';

// Use empty path to bypass global prefix
@Controller()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get('health')
  @Public()
  async check() {
    const health = {
      status: 'ok',
      service: 'tenant-service',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'unknown',
      },
    };

    // Check database connectivity
    try {
      await this.db.query('SELECT 1');
      health.checks.database = 'healthy';
    } catch (error) {
      health.status = 'degraded';
      health.checks.database = 'unhealthy';
    }

    return health;
  }
}

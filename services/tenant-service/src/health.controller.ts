import { Controller, Get } from '@nestjs/common';
import { Public } from './firebase/decorators';
import { DatabaseService } from './database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @Public()
  async check() {
    const health = {
      status: 'ok',
      service: 'tenant-service',
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

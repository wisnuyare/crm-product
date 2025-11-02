import { Controller, Get } from '@nestjs/common';
import { Public } from './firebase/decorators';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  check() {
    return {
      status: 'ok',
      service: 'tenant-service',
      timestamp: new Date().toISOString(),
    };
  }
}

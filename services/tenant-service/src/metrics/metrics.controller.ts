import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { register, collectDefaultMetrics } from 'prom-client';

@Controller('metrics')
export class MetricsController {
  constructor() {
    collectDefaultMetrics();
  }

  @Get()
  async getMetrics(@Res() res: Response) {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  }
}

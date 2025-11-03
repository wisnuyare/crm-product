import { Module } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { QuotaController } from './quota.controller';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [QuotaController],
  providers: [QuotaService],
  exports: [QuotaService], // Export for use in other modules
})
export class QuotaModule {}

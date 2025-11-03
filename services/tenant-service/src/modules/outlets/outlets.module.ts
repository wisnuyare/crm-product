import { Module, forwardRef } from '@nestjs/common';
import { OutletsController } from './outlets.controller';
import { OutletsService } from './outlets.service';
import { DatabaseModule } from '../../database/database.module';
import { QuotaModule } from '../quota/quota.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => QuotaModule)],
  controllers: [OutletsController],
  providers: [OutletsService],
  exports: [OutletsService],
})
export class OutletsModule {}

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { FirebaseModule } from './firebase/firebase.module';
import { FirebaseAuthGuard } from './firebase/firebase-auth.guard';
import { RolesGuard } from './firebase/roles.guard';
import { TenantsModule } from './modules/tenants/tenants.module';
import { OutletsModule } from './modules/outlets/outlets.module';
import { UsersModule } from './modules/users/users.module';
import { QuotaModule } from './modules/quota/quota.module';
import { HealthController } from './health.controller';
import { TenantContextMiddleware } from './middleware/tenant-context.middleware';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database (raw SQL with pg)
    DatabaseModule,

    // Firebase Auth
    FirebaseModule,

    // Feature modules
    TenantsModule,
    OutletsModule,
    UsersModule,
    QuotaModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global guards (applied to all routes)
    {
      provide: APP_GUARD,
      useClass: FirebaseAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply tenant context middleware to all routes
    // This sets PostgreSQL session variable for Row-Level Security
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes('*');
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { FirebaseModule } from './firebase/firebase.module';
import { FirebaseAuthGuard } from './firebase/firebase-auth.guard';
import { RolesGuard } from './firebase/roles.guard';
import { TenantsModule } from './modules/tenants/tenants.module';
import { OutletsModule } from './modules/outlets/outlets.module';
import { UsersModule } from './modules/users/users.module';
import { HealthController } from './health.controller';

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
export class AppModule {}

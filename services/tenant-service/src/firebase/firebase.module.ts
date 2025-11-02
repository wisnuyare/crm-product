import { Module, Global } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  providers: [FirebaseService, FirebaseAuthGuard, RolesGuard],
  exports: [FirebaseService, FirebaseAuthGuard, RolesGuard],
})
export class FirebaseModule {}

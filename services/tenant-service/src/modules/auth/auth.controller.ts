import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { Public } from '../../firebase/decorators';
import { DatabaseService } from '../../database/database.service';
import { FirebaseService } from '../../firebase/firebase.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly firebase: FirebaseService,
  ) {}

  @Post('signup')
  @Public()
  async signup(@Body() body: { email: string; password: string }) {
    const { email, password } = body;

    // 1. Check if user was invited (exists in database)
    const invitedUser = await this.db.query(
      'SELECT id, tenant_id, role FROM users WHERE email = $1',
      [email]
    );

    if (invitedUser.rows.length === 0) {
      throw new UnauthorizedException(
        'No invitation found for this email. Please contact your administrator.'
      );
    }

    const { id: userId, tenant_id, role } = invitedUser.rows[0];

    try {
      // 2. Create Firebase user
      const firebaseUser = await this.firebase.createUser(email, password);

      // 3. Set custom claims (tenant_id, role)
      await this.firebase.setCustomClaims(firebaseUser.uid, {
        tenant_id,
        role,
      });

      // 4. Update database: link Firebase UID to user record
      await this.db.query(
        'UPDATE users SET firebase_uid = $1 WHERE id = $2',
        [firebaseUser.uid, userId]
      );

      // 5. Generate custom token for immediate login
      const customToken = await this.firebase.createCustomToken(
        firebaseUser.uid,
        { tenant_id, role }
      );

      return {
        success: true,
        message: 'User created successfully',
        customToken, // Frontend uses this to sign in immediately
        user: {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          tenant_id,
          role,
        },
      };
    } catch (error: any) {
      // If Firebase user creation fails
      if (error.code === 'auth/email-already-exists') {
        throw new UnauthorizedException(
          'Email already registered. Please sign in instead.'
        );
      }
      throw error;
    }
  }

  @Post('google-signin')
  @Public()
  async googleSignIn(@Body() body: { idToken: string }) {
    const { idToken } = body;

    try {
      // 1. Verify Google ID token
      const decodedToken = await this.firebase.verifyIdToken(idToken);
      const { uid, email } = decodedToken;

      if (!email) {
        throw new UnauthorizedException('Email not provided by Google');
      }

      // 2. Check if user was invited (exists in database)
      const invitedUser = await this.db.query(
        'SELECT id, tenant_id, role, firebase_uid FROM users WHERE email = $1',
        [email]
      );

      if (invitedUser.rows.length === 0) {
        throw new UnauthorizedException(
          'No invitation found for this email. Please contact your administrator.'
        );
      }

      const { id: userId, tenant_id, role, firebase_uid } = invitedUser.rows[0];

      // 3. If first Google sign-in, link Firebase UID and set custom claims
      if (!firebase_uid) {
        await this.db.query(
          'UPDATE users SET firebase_uid = $1 WHERE id = $2',
          [uid, userId]
        );

        // Set custom claims
        await this.firebase.setCustomClaims(uid, {
          tenant_id,
          role,
        });
      }

      // 4. Return success
      return {
        success: true,
        message: 'Google sign-in successful',
        user: {
          uid,
          email,
          tenant_id,
          role,
        },
      };
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired Google token');
    }
  }
}

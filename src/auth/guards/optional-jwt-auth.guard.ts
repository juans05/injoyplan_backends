import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Attempts to authenticate using JWT if an Authorization header is present.
 * If the token is missing/invalid/expired, it does NOT throw — it simply leaves req.user undefined.
 * Used on @Public() routes that only want to personalize output for a logged-in user.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Override default behavior which throws when user is missing.
  handleRequest(err: any, user: any) {
    return user || null; // any auth failure (missing, expired, invalid) => guest mode
  }
}

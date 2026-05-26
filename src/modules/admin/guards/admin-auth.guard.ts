import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Admin Authentication Guard
 * Checks admin JWT token validity
 * Uses 'admin-jwt' strategy (separate from user JWT)
 */
@Injectable()
export class AdminAuthGuard extends AuthGuard('admin-jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, admin: any) {
    if (err || !admin) {
      throw new UnauthorizedException(
        'Admin authentication failed. Invalid or expired token.',
      );
    }
    return admin;
  }
}

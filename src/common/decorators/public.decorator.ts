import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark an endpoint as publicly accessible (skips JwtAuthGuard once configured).
 *
 * Usage:
 *   @Public()
 *   @Post('login')
 *   login(...) {}
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Extract the authenticated user from the request.
 * Returns the user object set by JwtStrategy (id, email, sessionId, etc.).
 *
 * Usage:
 *   @Get('me')
 *   me(@CurrentUser() user: AuthUser) {}
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

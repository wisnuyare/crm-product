import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './firebase-auth.guard';
import { ROLES_KEY } from './roles.guard';

/**
 * Mark a route as public (skip authentication)
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Require specific roles to access route
 * @example @Roles('admin', 'agent')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Get current user from request
 * @example async findAll(@CurrentUser() user: RequestUser)
 */
export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});

/**
 * Get tenant ID from current user
 * @example async findAll(@TenantId() tenantId: string)
 */
export const TenantId = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user?.tenantId;
});

/**
 * Request user interface
 */
export interface RequestUser {
  uid: string;
  email: string;
  tenantId: string;
  role: string;
  firebaseToken: any;
}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { AdminPermissionGuard } from './guards/admin-permission.guard';
import { PrismaModule } from 'src/common/prisma/prisma.module';

/**
 * Admin Module
 * Two-layer access control:
 * 1. Role-based (RBAC) - coarse-grained baseline permissions
 * 2. Permission-based (PBAC) - fine-grained override permissions
 *
 * Features:
 * - Separate JWT secret from user tokens (security boundary)
 * - Short-lived access tokens (15min) + long-lived refresh tokens (12h)
 * - Wildcard permission support ("*" grants everything)
 * - Flexible permission system (role-based + extra permissions)
 *
 * Default Role → Permissions Map:
 * - SUPER_ADMIN: * (everything)
 * - OPS_ADMIN: User/wallet management, transaction reversal
 * - FRAUD_OFFICER: Wallet freeze, fraud alerts, transaction marking
 * - SUPPORT: User/wallet/transaction read, support notes, KYC read
 * - READ_ONLY: Everything read-only
 */
@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminJwtStrategy,
    AdminAuthGuard,
    AdminPermissionGuard,
  ],
  exports: [AdminService, AdminAuthGuard, AdminPermissionGuard],
})
export class AdminModule {}

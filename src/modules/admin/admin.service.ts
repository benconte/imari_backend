import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { getEffectivePermissions } from './constants/role-permissions.constant';
import { AdminRole } from '@prisma/client';

/**
 * Admin Authentication Service
 * Handles:
 * - Admin login/logout
 * - JWT token generation (separate admin secret)
 * - Permission management
 * - Admin metadata retrieval
 */
@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Authenticate admin and return JWT tokens
   * Separate JWT secret from user tokens (security boundary)
   */
  async login(
    credentials: AdminLoginDto,
  ): Promise<{ accessToken: string; refreshToken: string; admin: any }> {
    const { email, password } = credentials;

    // Find admin by email
    const admin = await this.prisma.adminUser.findUnique({
      where: { email },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account is inactive');
    }

    // Verify password
    const isPasswordValid = await argon2.verify(admin.passwordHash, password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens(admin);

    // Update last login
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
      },
    };
  }

  /**
   * Refresh admin JWT tokens
   * Old refresh token must be valid
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_ADMIN_REFRESH_SECRET'),
        audience: 'admin-refresh',
      });

      const admin = await this.prisma.adminUser.findUnique({
        where: { id: payload.sub },
      });

      if (!admin || !admin.isActive) {
        throw new UnauthorizedException('Admin not found or inactive');
      }

      const accessToken = this.jwtService.sign(
        {
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions,
        },
        {
          subject: admin.id,
          secret: this.configService.get<string>('JWT_ADMIN_SECRET'),
          expiresIn: '15m',
          audience: 'admin',
        },
      );

      return { accessToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Get admin by ID with effective permissions
   */
  async getAdmin(adminId: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      return null;
    }

    const effectivePermissions = getEffectivePermissions(admin.role, admin.permissions);

    return {
      ...admin,
      effectivePermissions: Array.from(effectivePermissions),
    };
  }

  /**
   * Get all admins (for super admin)
   */
  async getAllAdmins(limit: number = 50, offset: number = 0) {
    const [admins, total] = await Promise.all([
      this.prisma.adminUser.findMany({
        take: limit,
        skip: offset,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          permissions: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      this.prisma.adminUser.count(),
    ]);

    return {
      admins: admins.map((admin) => ({
        ...admin,
        effectivePermissions: Array.from(
          getEffectivePermissions(admin.role, admin.permissions),
        ),
      })),
      total,
    };
  }

  /**
   * Update admin permissions
   */
  async updatePermissions(adminId: string, permissions: string[]): Promise<any> {
    return this.prisma.adminUser.update({
      where: { id: adminId },
      data: { permissions },
    });
  }

  /**
   * Update admin role
   */
  async updateRole(adminId: string, role: AdminRole): Promise<any> {
    return this.prisma.adminUser.update({
      where: { id: adminId },
      data: { role },
    });
  }

  /**
   * Deactivate admin account
   */
  async deactivateAdmin(adminId: string): Promise<any> {
    return this.prisma.adminUser.update({
      where: { id: adminId },
      data: { isActive: false },
    });
  }

  /**
   * Activate admin account
   */
  async activateAdmin(adminId: string): Promise<any> {
    return this.prisma.adminUser.update({
      where: { id: adminId },
      data: { isActive: true },
    });
  }

  /**
   * Generate JWT tokens for admin
   * Uses separate secret from user tokens
   * Short-lived access token (15min) + longer refresh token (12h)
   */
  private generateTokens(admin: any): { accessToken: string; refreshToken: string } {
    const accessToken = this.jwtService.sign(
      {
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
      },
      {
        subject: admin.id,
        secret: this.configService.get<string>('JWT_ADMIN_SECRET'),
        expiresIn: '15m',
        audience: 'admin',
      },
    );

    const refreshToken = this.jwtService.sign(
      {},
      {
        subject: admin.id,
        secret: this.configService.get<string>('JWT_ADMIN_REFRESH_SECRET'),
        expiresIn: '12h',
        audience: 'admin-refresh',
      },
    );

    return { accessToken, refreshToken };
  }
}

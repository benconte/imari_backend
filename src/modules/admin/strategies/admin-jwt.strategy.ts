import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/common/prisma/prisma.service';

/**
 * Admin JWT Strategy
 * Separate from user JWT strategy:
 * - Different secret key (admin_jwt_secret vs jwt_secret)
 * - Different audience claim ('admin' vs 'user')
 * - Different expiry (15min access / 12h refresh)
 */
@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ADMIN_SECRET'),
      audience: 'admin',
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    aud: string;
  }): Promise<any> {
    // Verify admin still exists and is active
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
    });

    if (!admin || !admin.isActive) {
      return null;
    }

    return {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions,
      firstName: admin.firstName,
      lastName: admin.lastName,
    };
  }
}

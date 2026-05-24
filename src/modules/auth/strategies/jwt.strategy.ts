import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { SessionStatus, UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '@common/prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  jti: string;
  type: 'access';
}

export interface AuthUser {
  userId: string;
  sessionId: string;
  jti: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.type !== 'access') throw new UnauthorizedException();

    const session = await this.prisma.userSession.findUnique({
      where: { jti: payload.jti },
      select: {
        id: true,
        userId: true,
        jti: true,
        status: true,
        expiresAt: true,
        user: { select: { status: true } },
      },
    });

    if (
      !session ||
      session.status !== SessionStatus.ACTIVE ||
      session.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    if (session.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    return { userId: session.userId, sessionId: session.id, jti: session.jti };
  }
}

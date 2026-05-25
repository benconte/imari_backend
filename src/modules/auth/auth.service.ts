import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, DeviceType, SessionStatus, UserStatus } from '@prisma/client';
import { authenticator } from '@otplib/preset-default';
import { randomUUID } from 'crypto';
import { PrismaService } from '@common/prisma/prisma.service';
import { decrypt } from '@common/utils/crypto.util';
import { hashSecret, randomToken, sha256, verifySecret } from '@common/utils/hash.util';
import { generateOtpCode, generateReference } from '@common/utils/reference.util';
import { EmailService } from '../../integrations/email/email.service';
import { WalletService } from '@modules/wallet/wallet.service';
import { DeviceDto, LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const RESET_OTP_EXPIRY_MS = 30 * 60 * 1000;
const REFRESH_TOKEN_DAYS = 30;

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly walletService: WalletService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const conflict = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
      select: { email: true, phone: true },
    });

    if (conflict) {
      throw new ConflictException(
        conflict.email === dto.email ? 'Email already registered' : 'Phone already registered',
      );
    }

    const [passwordHash, referredBy] = await Promise.all([
      hashSecret(dto.password),
      dto.referralCode
        ? this.prisma.user.findUnique({
            where: { referralCode: dto.referralCode },
            select: { id: true },
          })
        : null,
    ]);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        status: UserStatus.PENDING,
        referralCode: generateReference('IMR', 8),
        referredById: referredBy?.id,
      },
    });

    await this.dispatchEmailOtp(user.email, user.firstName, 'EMAIL_VERIFY');
    return { message: 'Account created. Check your email for a verification code.' };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, isEmailVerified: true },
    });

    if (!user) throw new NotFoundException('User not found');
    if (user.isEmailVerified) throw new BadRequestException('Email already verified');

    await this.consumeOtp(dto.email, dto.otp, 'EMAIL_VERIFY');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, status: UserStatus.ACTIVE, kycTier: 'TIER_1' },
    });

    // Create primary wallet automatically upon activation
    await this.walletService.ensurePrimaryWallet(user.id);

    await this.prisma.auditLog.create({
      data: { userId: user.id, action: AuditAction.KYC_SUBMITTED, metadata: { event: 'EMAIL_VERIFIED' } },
    });

    return { message: 'Email verified. You can now log in.' };
  }

  async login(
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<{ accessToken: string; refreshToken: string; user: object }> {
    await this.checkLockout(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        phone: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        status: true,
        isEmailVerified: true,
        isMfaEnabled: true,
        profilePhotoUrl: true,
        kycTier: true,
        preferredCurrency: true,
      },
    });

    if (!user || !(await verifySecret(user.passwordHash, dto.password))) {
      if (user) await this.recordAttempt(user.id, dto.email, false, 'INVALID_PASSWORD', meta);
      else await this.recordAttempt(null, dto.email, false, 'USER_NOT_FOUND', meta);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException('Please verify your email address before logging in');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(`Account is ${user.status.toLowerCase()}`);
    }

    if (user.isMfaEnabled) {
      if (!dto.totpCode) throw new UnauthorizedException('MFA code required');
      await this.verifyMfaCode(user.id, dto.totpCode);
    }

    const device = await this.upsertDevice(user.id, dto.device, meta.userAgent);
    const { accessToken, refreshToken } = await this.createSession(user.id, device.id, meta);

    await Promise.all([
      this.recordAttempt(user.id, dto.email, true, null, meta),
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: AuditAction.LOGIN,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          deviceId: device.deviceId,
        },
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        kycTier: user.kycTier,
        preferredCurrency: user.preferredCurrency,
        profilePhotoUrl: user.profilePhotoUrl,
        isMfaEnabled: user.isMfaEnabled,
      },
    };
  }

  async refreshTokens(
    rawToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = sha256(rawToken);

    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: tokenHash },
      select: { id: true, userId: true, status: true, refreshExpiresAt: true },
    });

    if (
      !session ||
      session.status !== SessionStatus.ACTIVE ||
      session.refreshExpiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const jti = randomUUID();
    const newRaw = randomToken();
    const newHash = sha256(newRaw);
    const expiresAt = this.refreshExpiry();

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { jti, refreshTokenHash: newHash, expiresAt, refreshExpiresAt: expiresAt },
    });

    const accessToken = await this.issueAccessToken(session.userId, jti);
    return { accessToken, refreshToken: newRaw };
  }

  async logout(jti: string, userId: string): Promise<{ message: string }> {
    await this.prisma.userSession.updateMany({
      where: { jti, userId },
      data: { status: SessionStatus.REVOKED, revokedAt: new Date(), revokedReason: 'USER_LOGOUT' },
    });

    await this.prisma.auditLog.create({
      data: { userId, action: AuditAction.LOGOUT },
    });

    return { message: 'Logged out successfully' };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, firstName: true },
    });

    if (user) {
      await this.prisma.oTPCode.updateMany({
        where: { target: email, purpose: 'RESET_PASSWORD', isUsed: false },
        data: { isUsed: true },
      });
      await this.dispatchEmailOtp(email, user.firstName, 'RESET_PASSWORD');
    }

    return { message: 'If that email is registered, a reset code has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (!user) throw new NotFoundException('User not found');

    await this.consumeOtp(dto.email, dto.otp, 'RESET_PASSWORD');

    const passwordHash = await hashSecret(dto.newPassword);

    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    await this.prisma.userSession.updateMany({
      where: { userId: user.id, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED, revokedAt: new Date(), revokedReason: 'PASSWORD_RESET' },
    });

    await this.prisma.auditLog.create({
      data: { userId: user.id, action: AuditAction.PASSWORD_CHANGE },
    });

    return { message: 'Password reset successfully. Please log in with your new password.' };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async dispatchEmailOtp(
    email: string,
    firstName: string,
    purpose: 'EMAIL_VERIFY' | 'RESET_PASSWORD',
  ): Promise<void> {
    await this.prisma.oTPCode.updateMany({
      where: { target: email, purpose, isUsed: false },
      data: { isUsed: true },
    });

    const otp = generateOtpCode();
    const expiryMs = purpose === 'RESET_PASSWORD' ? RESET_OTP_EXPIRY_MS : OTP_EXPIRY_MS;

    await this.prisma.oTPCode.create({
      data: {
        target: email,
        codeHash: sha256(otp),
        purpose,
        expiresAt: new Date(Date.now() + expiryMs),
      },
    });

    await this.emailService.sendOtp({ to: email, firstName, otp, purpose });
  }

  private async consumeOtp(target: string, code: string, purpose: string): Promise<void> {
    const record = await this.prisma.oTPCode.findFirst({
      where: { target, purpose, isUsed: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) throw new BadRequestException('No verification code found for this email');
    if (record.expiresAt < new Date()) throw new BadRequestException('Verification code has expired');
    if (record.attempts >= record.maxAttempts)
      throw new HttpException('Too many failed OTP attempts. Request a new code.', HttpStatus.TOO_MANY_REQUESTS);

    const valid = record.codeHash === sha256(code);

    await this.prisma.oTPCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 }, isUsed: valid, usedAt: valid ? new Date() : undefined },
    });

    if (!valid) throw new BadRequestException('Invalid verification code');
  }

  private async checkLockout(identifier: string): Promise<void> {
    const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
    const count = await this.prisma.loginAttempt.count({
      where: { identifier, success: false, createdAt: { gte: since } },
    });
    if (count >= MAX_LOGIN_ATTEMPTS) {
      throw new HttpException(
        'Too many failed login attempts. Please try again in 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordAttempt(
    userId: string | null,
    identifier: string,
    success: boolean,
    failureReason: string | null,
    meta: RequestMeta,
  ): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        userId: userId ?? undefined,
        identifier,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        success,
        failureReason: failureReason ?? undefined,
      },
    });
  }

  private async upsertDevice(userId: string, dto: DeviceDto | undefined, userAgent?: string) {
    const clientDeviceId = dto?.deviceId ?? randomUUID();

    const existing = await this.prisma.userDevice.findUnique({
      where: { deviceId: clientDeviceId },
    });

    if (existing) {
      return this.prisma.userDevice.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          pushToken: dto?.pushToken ?? existing.pushToken,
          appVersion: dto?.appVersion ?? existing.appVersion,
        },
      });
    }

    return this.prisma.userDevice.create({
      data: {
        userId,
        deviceId: clientDeviceId,
        deviceName: dto?.deviceName ?? 'Unknown Device',
        deviceType: (dto?.deviceType ?? 'WEB') as DeviceType,
        platform: dto?.platform ?? (userAgent ? userAgent.split('/')[0] : 'web'),
        osVersion: dto?.osVersion,
        appVersion: dto?.appVersion,
        fingerprint: dto?.fingerprint,
        pushToken: dto?.pushToken,
        lastSeenAt: new Date(),
      },
    });
  }

  private async createSession(userId: string, deviceId: string, meta: RequestMeta) {
    const jti = randomUUID();
    const rawRefresh = randomToken();
    const expiresAt = this.refreshExpiry();

    const [accessToken] = await Promise.all([this.issueAccessToken(userId, jti)]);

    await this.prisma.userSession.create({
      data: {
        userId,
        deviceId,
        jti,
        refreshTokenHash: sha256(rawRefresh),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        status: SessionStatus.ACTIVE,
        expiresAt,
        refreshExpiresAt: expiresAt,
      },
    });

    return { accessToken, refreshToken: rawRefresh };
  }

  private issueAccessToken(userId: string, jti: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, jti, type: 'access' },
      {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>('jwt.accessExpiresIn', '15m'),
      },
    );
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  }

  private async verifyMfaCode(userId: string, code: string): Promise<void> {
    const mfaRecord = await this.prisma.mfaSecret.findUnique({
      where: { userId },
      include: { backupCodes: { where: { usedAt: null } } },
    });

    if (!mfaRecord?.enabledAt) throw new UnauthorizedException('MFA not configured');

    const secret = decrypt(mfaRecord.secret);

    if (authenticator.verify({ token: code, secret })) {
      await this.prisma.mfaSecret.update({
        where: { id: mfaRecord.id },
        data: { lastUsedAt: new Date() },
      });
      return;
    }

    const codeHash = sha256(code);
    const backup = mfaRecord.backupCodes.find((bc) => bc.codeHash === codeHash);
    if (backup) {
      await this.prisma.mfaBackupCode.update({
        where: { id: backup.id },
        data: { usedAt: new Date() },
      });
      return;
    }

    throw new UnauthorizedException('Invalid MFA code');
  }
}

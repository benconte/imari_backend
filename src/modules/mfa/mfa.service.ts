import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { authenticator } from '@otplib/preset-default';
import * as QRCode from 'qrcode';
import { PrismaService } from '@common/prisma/prisma.service';
import { decrypt, encrypt } from '@common/utils/crypto.util';
import { randomToken, sha256 } from '@common/utils/hash.util';

const BACKUP_CODE_COUNT = 10;
const TOTP_WINDOW = 1; // Allow ±1 time step (30s each direction)

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(private readonly prisma: PrismaService) {}

  private verifyTotpWithWindow(code: string, secret: string): boolean {
    return authenticator.create({ window: TOTP_WINDOW }).verify({ token: code, secret });
  }

  async initEnable(userId: string): Promise<{
    secret: string;
    formattedKey: string;
    setupUrl: string;
    qrDataUrl: string;
  }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, isMfaEnabled: true },
    });

    if (user.isMfaEnabled) {
      throw new BadRequestException('MFA is already enabled on this account');
    }

    const secret = authenticator.generateSecret(20);
    const qrCodeUri = authenticator.keyuri(user.email, 'Imari', secret);
    const qrDataUrl = await QRCode.toDataURL(qrCodeUri);

    // Store pending secret (enabledAt remains null until confirmed)
    await this.prisma.mfaSecret.upsert({
      where: { userId },
      create: { userId, secret: encrypt(secret) },
      update: { secret: encrypt(secret), enabledAt: null, lastUsedAt: null },
    });

    // Clear any stale backup codes from previous attempts
    const mfaRecord = await this.prisma.mfaSecret.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (mfaRecord) {
      await this.prisma.mfaBackupCode.deleteMany({ where: { mfaSecretId: mfaRecord.id } });
    }

    // Format secret in 4-char groups for easy manual entry in authenticator apps
    const formattedKey = secret.match(/.{1,4}/g)?.join(' ') ?? secret;

    return { secret, formattedKey, setupUrl: qrCodeUri, qrDataUrl };
  }

  async confirmEnable(userId: string, totpCode: string): Promise<{ backupCodes: string[] }> {
    const mfaRecord = await this.prisma.mfaSecret.findUnique({
      where: { userId },
      select: { id: true, secret: true, enabledAt: true },
    });

    if (!mfaRecord) {
      this.logger.warn(`MFA setup not initiated for user: ${userId}`);
      throw new BadRequestException('MFA setup not initiated. Call /mfa/enable first.');
    }

    if (mfaRecord.enabledAt) {
      this.logger.warn(`MFA already confirmed for user: ${userId}`);
      throw new BadRequestException('MFA already confirmed');
    }

    const secret = decrypt(mfaRecord.secret);

    // Verify TOTP code with time window support (allows ±60 seconds clock drift)
    const isValidTotp = this.verifyTotpWithWindow(totpCode, secret);

    if (!isValidTotp) {
      this.logger.warn(`Invalid TOTP code provided for user: ${userId}`);
      throw new UnauthorizedException('Invalid TOTP code. Ensure your authenticator app is synced and time is correct.');
    }

    this.logger.debug(`TOTP verified successfully for user: ${userId}`);

    // Generate backup codes
    const plainCodes = Array.from({ length: BACKUP_CODE_COUNT }, () => randomToken(5));

    try {
      await this.prisma.$transaction([
        this.prisma.mfaSecret.update({
          where: { id: mfaRecord.id },
          data: { enabledAt: new Date() },
        }),
        this.prisma.mfaBackupCode.createMany({
          data: plainCodes.map((code) => ({
            mfaSecretId: mfaRecord.id,
            codeHash: sha256(code),
          })),
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: { isMfaEnabled: true },
        }),
      ]);

      await this.prisma.auditLog.create({
        data: { userId, action: AuditAction.MFA_ENABLED },
      });

      this.logger.log(`MFA enabled successfully for user: ${userId}`);
      return { backupCodes: plainCodes };
    } catch (error) {
      this.logger.error(`Error confirming MFA for user: ${userId}`, error instanceof Error ? error.stack : error);
      throw new BadRequestException('Failed to enable MFA. Please try again.');
    }
  }

  async getBackupCodeStatus(userId: string): Promise<{ remaining: number; total: number }> {
    const mfaRecord = await this.prisma.mfaSecret.findUnique({
      where: { userId },
      select: { id: true, _count: { select: { backupCodes: true } } },
    });

    if (!mfaRecord) throw new BadRequestException('MFA is not enabled');

    const unused = await this.prisma.mfaBackupCode.count({
      where: { mfaSecretId: mfaRecord.id, usedAt: null },
    });

    return { remaining: unused, total: mfaRecord._count.backupCodes };
  }

  async disable(userId: string, code: string): Promise<{ message: string }> {
    const mfaRecord = await this.prisma.mfaSecret.findUnique({
      where: { userId },
      include: { backupCodes: { where: { usedAt: null } } },
    });

    if (!mfaRecord?.enabledAt) {
      this.logger.warn(`User attempted to disable MFA but it's not enabled: ${userId}`);
      throw new BadRequestException('MFA is not enabled');
    }

    const secret = decrypt(mfaRecord.secret);
    const validTotp = this.verifyTotpWithWindow(code, secret);

    if (!validTotp) {
      const codeHash = sha256(code);
      const backup = mfaRecord.backupCodes.find((bc) => bc.codeHash === codeHash);
      if (!backup) {
        this.logger.warn(`Invalid code provided for MFA disable by user: ${userId}`);
        throw new UnauthorizedException('Invalid code (TOTP or backup code)');
      }
      this.logger.debug(`Using backup code for MFA disable by user: ${userId}`);
    }

    try {
      await this.prisma.$transaction([
        this.prisma.mfaBackupCode.deleteMany({ where: { mfaSecretId: mfaRecord.id } }),
        this.prisma.mfaSecret.delete({ where: { id: mfaRecord.id } }),
        this.prisma.user.update({ where: { id: userId }, data: { isMfaEnabled: false } }),
      ]);

      await this.prisma.auditLog.create({
        data: { userId, action: AuditAction.MFA_DISABLED },
      });

      this.logger.log(`MFA disabled successfully for user: ${userId}`);
      return { message: 'MFA disabled successfully' };
    } catch (error) {
      this.logger.error(`Error disabling MFA for user: ${userId}`, error instanceof Error ? error.stack : error);
      throw new BadRequestException('Failed to disable MFA. Please try again.');
    }
  }
}

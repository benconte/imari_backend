import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { authenticator } from '@otplib/preset-default';
import * as QRCode from 'qrcode';
import { PrismaService } from '@common/prisma/prisma.service';
import { decrypt, encrypt } from '@common/utils/crypto.util';
import { randomToken, sha256 } from '@common/utils/hash.util';

const BACKUP_CODE_COUNT = 10;

@Injectable()
export class MfaService {
  constructor(private readonly prisma: PrismaService) {}

  async initEnable(userId: string): Promise<{
    secret: string;
    qrCodeUri: string;
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

    return { secret, qrCodeUri, qrDataUrl };
  }

  async confirmEnable(userId: string, totpCode: string): Promise<{ backupCodes: string[] }> {
    const mfaRecord = await this.prisma.mfaSecret.findUnique({
      where: { userId },
      select: { id: true, secret: true, enabledAt: true },
    });

    if (!mfaRecord) throw new BadRequestException('MFA setup not initiated. Call /mfa/enable first.');
    if (mfaRecord.enabledAt) throw new BadRequestException('MFA already confirmed');

    const secret = decrypt(mfaRecord.secret);

    if (!authenticator.verify({ token: totpCode, secret })) {
      throw new UnauthorizedException('Invalid TOTP code. Ensure your authenticator app is synced.');
    }

    // Generate backup codes
    const plainCodes = Array.from({ length: BACKUP_CODE_COUNT }, () => randomToken(5));

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

    return { backupCodes: plainCodes };
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

    if (!mfaRecord?.enabledAt) throw new BadRequestException('MFA is not enabled');

    const secret = decrypt(mfaRecord.secret);
    const validTotp = authenticator.verify({ token: code, secret });

    if (!validTotp) {
      const codeHash = sha256(code);
      const backup = mfaRecord.backupCodes.find((bc) => bc.codeHash === codeHash);
      if (!backup) throw new UnauthorizedException('Invalid code');
    }

    await this.prisma.$transaction([
      this.prisma.mfaBackupCode.deleteMany({ where: { mfaSecretId: mfaRecord.id } }),
      this.prisma.mfaSecret.delete({ where: { id: mfaRecord.id } }),
      this.prisma.user.update({ where: { id: userId }, data: { isMfaEnabled: false } }),
    ]);

    await this.prisma.auditLog.create({
      data: { userId, action: AuditAction.MFA_DISABLED },
    });

    return { message: 'MFA disabled successfully' };
  }
}

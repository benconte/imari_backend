import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, DeviceType, DocumentType, KYCStatus } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UploadKycDto } from './dto/upload-kyc.dto';

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        profilePhotoUrl: true,
        status: true,
        kycStatus: true,
        kycTier: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        isMfaEnabled: true,
        preferredCurrency: true,
        preferredLanguage: true,
        referralCode: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    // Check if wallet pin exists
    const pinExists = await this.prisma.walletPin.findUnique({
      where: { userId },
      select: { id: true },
    });

    return {
      ...user,
      isPinSet: !!pinExists,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        profilePhotoUrl: dto.profilePhotoUrl,
        preferredCurrency: dto.preferredCurrency as any,
        preferredLanguage: dto.preferredLanguage,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        profilePhotoUrl: true,
        preferredCurrency: true,
        preferredLanguage: true,
        updatedAt: true,
      },
    });
  }

  async listDevices(userId: string) {
    return this.prisma.userDevice.findMany({
      where: { userId },
      select: {
        id: true,
        deviceId: true,
        deviceName: true,
        deviceType: true,
        platform: true,
        osVersion: true,
        appVersion: true,
        isTrusted: true,
        lastSeenAt: true,
        registeredAt: true,
      },
      orderBy: { registeredAt: 'desc' },
    });
  }

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    const device = await this.prisma.userDevice.upsert({
      where: { deviceId: dto.deviceId },
      create: {
        userId,
        deviceId: dto.deviceId,
        deviceName: dto.deviceName,
        deviceType: dto.deviceType as DeviceType,
        platform: dto.platform ?? 'unknown',
        osVersion: dto.osVersion,
        appVersion: dto.appVersion,
        fingerprint: dto.fingerprint,
        pushToken: dto.pushToken,
        lastSeenAt: new Date(),
      },
      update: {
        deviceName: dto.deviceName,
        osVersion: dto.osVersion,
        appVersion: dto.appVersion,
        pushToken: dto.pushToken,
        lastSeenAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: { userId, action: AuditAction.DEVICE_REGISTERED, deviceId: device.deviceId },
    });

    return device;
  }

  async trustDevice(userId: string, deviceId: string) {
    const device = await this.prisma.userDevice.findUnique({ where: { deviceId } });
    if (!device || device.userId !== userId) throw new NotFoundException('Device not found');

    return this.prisma.userDevice.update({
      where: { id: device.id },
      data: { isTrusted: true },
    });
  }

  async removeDevice(userId: string, deviceId: string) {
    const device = await this.prisma.userDevice.findUnique({ where: { deviceId } });
    if (!device || device.userId !== userId) throw new NotFoundException('Device not found');

    await this.prisma.userDevice.delete({ where: { id: device.id } });

    await this.prisma.auditLog.create({
      data: { userId, action: AuditAction.DEVICE_REMOVED, deviceId },
    });

    return { message: 'Device removed' };
  }

  async submitKyc(userId: string, dto: UploadKycDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { kycStatus: true },
    });

    if (!user) throw new NotFoundException('User not found');

    if (user.kycStatus === KYCStatus.VERIFIED) {
      throw new BadRequestException('KYC already verified');
    }

    const doc = await this.prisma.kYCDocument.upsert({
      where: { userId },
      create: {
        userId,
        documentType: dto.documentType as DocumentType,
        documentNumber: dto.documentNumber,
        documentFrontUrl: dto.documentFrontUrl,
        documentBackUrl: dto.documentBackUrl ?? null,
        selfieUrl: dto.selfieUrl ?? null,
      },
      update: {
        documentType: dto.documentType as DocumentType,
        documentNumber: dto.documentNumber,
        documentFrontUrl: dto.documentFrontUrl,
        documentBackUrl: dto.documentBackUrl ?? null,
        selfieUrl: dto.selfieUrl ?? null,
        rejectedAt: null,
        rejectionReason: null,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus: KYCStatus.IN_PROGRESS },
    });

    await this.prisma.auditLog.create({
      data: { userId, action: AuditAction.KYC_SUBMITTED, resource: `kyc:${doc.id}` },
    });

    return { message: 'KYC documents submitted. Under review.', documentId: doc.id };
  }
}

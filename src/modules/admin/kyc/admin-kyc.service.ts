import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, KYCStatus, KYCTier, Prisma } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { AdminKycQueryDto } from './dto/admin-kyc-query.dto';
import { AdminKycRejectDto } from './dto/admin-kyc-reject.dto';

const KYC_OWNER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

@Injectable()
export class AdminKycService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pending KYC submissions queue (not yet verified or rejected), oldest first.
   *
   * Schema gap: the frontend `KYCSubmission` type expects `riskScore`, `faceMatchPct`,
   * `expiryDate`, `nationality`, `avatarCode` — none of these exist on `KYCDocument` or `User`.
   * They are deliberately NOT fabricated here; only real stored fields are returned. Surfacing
   * this so product can decide whether those need a verification-provider integration or the
   * frontend type should be trimmed to match reality.
   */
  async getQueue(query: AdminKycQueryDto) {
    const where: Prisma.KYCDocumentWhereInput = {
      verifiedAt: null,
      rejectedAt: null,
    };

    if (query.search) {
      where.OR = [
        { documentNumber: { contains: query.search, mode: 'insensitive' } },
        { user: { is: { firstName: { contains: query.search, mode: 'insensitive' } } } },
        { user: { is: { lastName: { contains: query.search, mode: 'insensitive' } } } },
        { user: { is: { email: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const [documents, total] = await Promise.all([
      this.prisma.kYCDocument.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          documentType: true,
          documentNumber: true,
          documentFrontUrl: true,
          documentBackUrl: true,
          selfieUrl: true,
          createdAt: true,
          verifiedAt: true,
          rejectedAt: true,
          rejectionReason: true,
          user: { select: KYC_OWNER_SELECT },
        },
      }),
      this.prisma.kYCDocument.count({ where }),
    ]);

    return {
      documents: documents.map(({ user, ...rest }) => ({ ...rest, owner: user })),
      total,
    };
  }

  async approveKyc(docId: string, adminId: string) {
    const doc = await this.prisma.kYCDocument.findUnique({
      where: { id: docId },
      select: { id: true, userId: true, verifiedAt: true, rejectedAt: true },
    });
    if (!doc) throw new NotFoundException('KYC submission not found');
    if (doc.verifiedAt) throw new BadRequestException('KYC submission is already approved');
    if (doc.rejectedAt) throw new BadRequestException('KYC submission was rejected; the user must resubmit before it can be approved');

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.kYCDocument.update({
        where: { id: docId },
        data: { verifiedAt: now, reviewedById: adminId },
      }),
      this.prisma.user.update({
        where: { id: doc.userId },
        // TIER_2 = "ID verified" — the standard tier granted on successful document review
        data: { kycStatus: KYCStatus.VERIFIED, kycTier: KYCTier.TIER_2 },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: doc.userId,
          adminId,
          action: AuditAction.KYC_VERIFIED,
          resource: `kyc_document:${docId}`,
          metadata: { reviewedById: adminId },
        },
      }),
    ]);

    return { id: docId, userId: doc.userId, verifiedAt: now };
  }

  async rejectKyc(docId: string, adminId: string, dto: AdminKycRejectDto) {
    const doc = await this.prisma.kYCDocument.findUnique({
      where: { id: docId },
      select: { id: true, userId: true, verifiedAt: true, rejectedAt: true },
    });
    if (!doc) throw new NotFoundException('KYC submission not found');
    if (doc.verifiedAt) throw new BadRequestException('KYC submission is already approved');
    if (doc.rejectedAt) throw new BadRequestException('KYC submission is already rejected');

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.kYCDocument.update({
        where: { id: docId },
        data: { rejectedAt: now, rejectionReason: dto.rejectionReason, reviewedById: adminId },
      }),
      this.prisma.user.update({
        where: { id: doc.userId },
        data: { kycStatus: KYCStatus.REJECTED },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: doc.userId,
          adminId,
          action: AuditAction.KYC_REJECTED,
          resource: `kyc_document:${docId}`,
          metadata: { rejectionReason: dto.rejectionReason, reviewedById: adminId },
        },
      }),
    ]);

    return { id: docId, userId: doc.userId, rejectedAt: now, rejectionReason: dto.rejectionReason };
  }
}

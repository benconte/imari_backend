import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class BeneficiaryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: any) {
    // create or update existing beneficiary by wallet number
    const existing = await this.prisma.beneficiary.findFirst({ where: { userId, imariWalletNumber: dto.imariWalletNumber } });
    if (existing) {
      return this.prisma.beneficiary.update({ where: { id: existing.id }, data: { displayName: dto.displayName, phone: dto.phone, updatedAt: new Date(), lastUsedAt: new Date() } });
    }

    return this.prisma.beneficiary.create({ data: { userId, type: 'IMARI_USER' as any, displayName: dto.displayName, imariUserId: dto.imariUserId, imariWalletNumber: dto.imariWalletNumber, phone: dto.phone, isFavorite: false, lastUsedAt: new Date() } });
  }

  async recent(userId: string, limit = 10) {
    return this.prisma.beneficiary.findMany({ where: { userId }, orderBy: { lastUsedAt: 'desc' }, take: limit });
  }

  async remove(userId: string, id: string) {
    const b = await this.prisma.beneficiary.findUnique({ where: { id } });
    if (!b || b.userId !== userId) throw new NotFoundException('Beneficiary not found');
    return this.prisma.beneficiary.delete({ where: { id } });
  }
}

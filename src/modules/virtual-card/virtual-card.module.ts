import { Module } from '@nestjs/common';
import { VirtualCardController } from './virtual-card.controller';
import { VirtualCardService } from './virtual-card.service';
import { PrismaModule } from '@common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VirtualCardController],
  providers: [VirtualCardService],
})
export class VirtualCardModule {}
import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

@Module({
  imports: [AuthModule],
  controllers: [IdentityController],
  providers: [IdentityService],
})
export class IdentityModule {}

import { Module } from '@nestjs/common';
import { FlutterwaveController } from './flutterwave.controller';
import { FlutterwaveService } from './flutterwave.service';

// PrismaModule is decorated @Global() — PrismaService is available without import.
// ConfigModule is registered with isGlobal: true in AppModule — available without import.

@Module({
  controllers: [FlutterwaveController],
  providers: [FlutterwaveService],
  exports: [FlutterwaveService], // Export so other modules can call initializePayment / verifyTransaction
})
export class FlutterwaveModule {}

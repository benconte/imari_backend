import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public, CurrentUser } from '@common/decorators/public.decorator';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { FlutterwaveService } from './flutterwave.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { FlutterwaveWebhookPayload } from './types/flutterwave.types';

@ApiTags('Payments - Flutterwave')
@Controller('flutterwave')
export class FlutterwaveController {
  private readonly logger = new Logger(FlutterwaveController.name);

  constructor(private readonly flutterwaveService: FlutterwaveService) {}

  /**
   * POST /flutterwave/initialize
   *
   * Initializes a Flutterwave-hosted payment session.
   * Returns a checkout link the client must redirect the user to.
   *
   * After payment, Flutterwave redirects to `redirectUrl` (query params include
   * `status`, `tx_ref`, `transaction_id`) AND sends a webhook to POST /flutterwave/webhook.
   * The wallet is credited by the webhook handler — NOT by this endpoint.
   */
  @Post('initialize')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Initialize a Flutterwave payment',
    description:
      'Creates a Flutterwave checkout session for the authenticated user. ' +
      'Returns a hosted payment link. The wallet is credited automatically after ' +
      'Flutterwave confirms payment via webhook.',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment initialized. Returns paymentLink, txRef, and transactionId.',
    schema: {
      example: {
        success: true,
        statusCode: 201,
        data: {
          paymentLink: 'https://checkout.flutterwave.com/v3/hosted/pay/...',
          txRef: 'IMR-TXN-A3K7X9BWQP',
          transactionId: 'uuid-internal-transaction-id',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input or inactive account / wallet.' })
  @ApiResponse({ status: 500, description: 'Flutterwave API unreachable.' })
  async initializePayment(
    @CurrentUser() user: AuthUser,
    @Body() dto: InitializePaymentDto,
  ) {
    return this.flutterwaveService.initializePayment(user.userId, dto);
  }

  /**
   * GET /flutterwave/verify/:transactionId
   *
   * Queries Flutterwave's verify endpoint for a given transaction ID.
   * Use the numeric `transaction_id` that Flutterwave appends to your redirectUrl
   * after payment (e.g., ?transaction_id=12345678).
   *
   * This endpoint does NOT update the database — it is a read-only status check.
   * The authoritative wallet credit happens via webhook.
   */
  @Get('verify/:transactionId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify a Flutterwave transaction',
    description:
      'Fetches transaction status directly from Flutterwave API. Use the numeric ' +
      'transaction_id from the payment callback (not our internal txRef). ' +
      'Returns the raw Flutterwave verification object.',
  })
  @ApiParam({
    name: 'transactionId',
    description: 'Flutterwave numeric transaction ID (from callback query param transaction_id)',
    example: '5240742',
  })
  @ApiResponse({
    status: 200,
    description: 'Flutterwave transaction details.',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        data: {
          id: 5240742,
          tx_ref: 'IMR-TXN-A3K7X9BWQP',
          flw_ref: 'FLW-MOCK-...',
          amount: 1000,
          currency: 'RWF',
          status: 'successful',
          payment_type: 'mobilemoney_rwanda',
          customer: { email: 'user@example.com', name: 'John Doe' },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Verification failed (e.g., transaction not found).' })
  async verifyTransaction(@Param('transactionId') transactionId: string) {
    return this.flutterwaveService.verifyTransaction(transactionId);
  }

  /**
   * POST /flutterwave/webhook
   *
   * Flutterwave posts payment events here. This endpoint:
   *  1. Validates the `verif-hash` header with constant-time comparison.
   *  2. Deduplicates via providerEventId (Flutterwave transaction ID).
   *  3. For `charge.completed`: verifies the charge with Flutterwave API,
   *     then atomically credits the user wallet using a DB-level CAS lock.
   *
   * Security:
   *  - @Public() — no JWT required (Flutterwave calls this, not end-users).
   *  - @SkipThrottle() — rate-limiting would cause Flutterwave retries to fail.
   *  - Always returns 200 for valid events to prevent infinite retry loops.
   *  - Returns 401 for invalid signatures (Flutterwave stops retrying on 4xx).
   *
   * Configure your webhook URL in the Flutterwave dashboard:
   *   https://<your-domain>/api/v1/flutterwave/webhook
   */
  @Post('webhook')
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Flutterwave webhook receiver (public)',
    description:
      'Receives and processes payment events from Flutterwave. ' +
      'Protected by verif-hash header validation. Not for direct client use.',
  })
  @ApiHeader({
    name: 'verif-hash',
    description: 'Flutterwave webhook secret hash (set as FLUTTERWAVE_WEBHOOK_HASH in env)',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Event received and processed.' })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature.' })
  async handleWebhook(
    @Body() payload: FlutterwaveWebhookPayload,
    @Headers('verif-hash') signature: string,
  ) {
    await this.flutterwaveService.handleWebhook(payload, signature);
    return { status: 'ok' };
  }
}

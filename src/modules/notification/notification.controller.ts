import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/public.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { NotificationQueryDto, NotificationQuerySchema } from './dto/notification-query.dto';
import { UpdatePreferenceDto, UpdatePreferenceSchema } from './dto/preference.dto';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({
    summary: 'List notifications',
    description: 'Returns paginated notifications for the authenticated user, newest first.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'unreadOnly', required: false, example: false })
  @ApiOkResponse({ description: 'Paginated notification list.' })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(NotificationQuerySchema)) query: NotificationQueryDto,
  ) {
    return this.notificationService.list(user.userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread count', description: 'Returns the number of unread notifications.' })
  @ApiOkResponse({ schema: { type: 'object', properties: { count: { type: 'number', example: 3 } } } })
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationService.unreadCount(user.userId);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiOkResponse({ description: 'Notification marked as read.' })
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notificationService.markRead(user.userId, id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Marks every unread notification for the authenticated user as read.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { marked: { type: 'number', example: 5, description: 'Number of notifications marked as read' } },
    },
  })
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationService.markAllRead(user.userId);
  }

  @Get('preferences')
  @ApiOperation({
    summary: 'Get notification preferences',
    description:
      'Returns the user\'s notification preference settings (channels, muted types, quiet hours, timezone, digest mode). Creates default preferences if none exist.',
  })
  @ApiOkResponse({ description: 'Notification preferences.' })
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.notificationService.getPreferences(user.userId);
  }

  @Put('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update notification preferences',
    description: `
Update which channels you receive notifications on and configure quiet hours.

**Channels:** \`IN_APP\`, \`PUSH\`, \`EMAIL\`

**Quiet hours:** Set \`quietFrom\`/\`quietTo\` in \`HH:MM\` format (24h) with your \`timezone\`.
During quiet hours, PUSH and EMAIL are suppressed; IN_APP always delivers.

**Email digest:** When \`emailDigest: true\`, low-priority types (budget alerts, subscription reminders,
promotional) are batched instead of sending individual emails.
    `.trim(),
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        channels: {
          type: 'array',
          items: { type: 'string', enum: ['IN_APP', 'PUSH', 'EMAIL'] },
          example: ['IN_APP', 'PUSH', 'EMAIL'],
        },
        mutedTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'TRANSACTION_ALERT', 'SECURITY_WARNING', 'SAVINGS_UPDATE',
              'BUDGET_ALERT', 'PAYMENT_CONFIRMATION', 'PROMOTIONAL',
              'FINANCIAL_INSIGHT', 'SUBSCRIPTION_REMINDER', 'KYC_UPDATE', 'CARD_ALERT',
            ],
          },
          example: ['PROMOTIONAL'],
        },
        quietFrom: { type: 'string', example: '22:00', description: 'Quiet hours start (HH:MM, 24h)' },
        quietTo: { type: 'string', example: '07:00', description: 'Quiet hours end (HH:MM, 24h)' },
        timezone: { type: 'string', example: 'Africa/Kigali' },
        emailDigest: { type: 'boolean', example: false },
      },
    },
  })
  @ApiOkResponse({ description: 'Preferences updated.' })
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UpdatePreferenceSchema)) dto: UpdatePreferenceDto,
  ) {
    return this.notificationService.updatePreferences(user.userId, dto);
  }
}

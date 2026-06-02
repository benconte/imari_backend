import {
  Controller,
  Get,
  Post,
  Param,
  Patch,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/public.decorator';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { InsightsService } from './insights.service';

@ApiTags('insights')
@ApiBearerAuth()
@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all financial insights for the current user' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by insight type (SPENDING_PATTERN, BUDGET_WARNING, SAVING_OPPORTUNITY, SUBSCRIPTION_ALERT)' })
  @ApiQuery({ name: 'isRead', required: false, description: 'Filter by read status' })
  @ApiQuery({ name: 'isDismissed', required: false, description: 'Filter by dismissed status' })
  @ApiResponse({ status: 200, description: 'List of insights retrieved successfully' })
  async getInsights(
    @CurrentUser() user: AuthUser,
    @Query('type') type?: string,
    @Query('isRead') isRead?: string,
    @Query('isDismissed') isDismissed?: string,
  ) {
    return this.insightsService.getUserInsights(user.userId, {
      type,
      isRead: isRead ? isRead === 'true' : undefined,
      isDismissed: isDismissed ? isDismissed === 'true' : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific financial insight' })
  @ApiParam({ name: 'id', description: 'Insight ID' })
  @ApiResponse({ status: 200, description: 'Insight retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Insight not found' })
  async getInsight(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.insightsService.getInsightById(user.userId, id);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an insight as read' })
  @ApiParam({ name: 'id', description: 'Insight ID' })
  @ApiResponse({ status: 200, description: 'Insight marked as read' })
  @ApiResponse({ status: 404, description: 'Insight not found' })
  async markAsRead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.insightsService.markAsRead(user.userId, id);
  }

  @Patch(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss an insight' })
  @ApiParam({ name: 'id', description: 'Insight ID' })
  @ApiResponse({ status: 200, description: 'Insight dismissed' })
  @ApiResponse({ status: 404, description: 'Insight not found' })
  async dismissInsight(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.insightsService.dismissInsight(user.userId, id);
  }

  @Post('generate/trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[ADMIN ONLY] Manually trigger insight generation for all users' })
  @ApiResponse({ status: 200, description: 'Insights generated successfully' })
  async generateInsights() {
    await this.insightsService.generateAllInsights();
    return { success: true, message: 'Financial insights generated successfully' };
  }

  @Post('generate/demo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate demo insights for testing (includes sample data)' })
  @ApiResponse({ status: 200, description: 'Demo insights created successfully' })
  async generateDemoInsights(@CurrentUser() user: AuthUser) {
    await this.insightsService.generateDemoInsights(user.userId);
    return { success: true, message: 'Demo insights created successfully' };
  }
}

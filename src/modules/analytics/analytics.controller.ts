import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/public.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { AnalyticsSnapshotService } from './services/analytics-snapshot.service';
import { CategorizationService } from './services/categorization.service';
import { HealthScoreService } from './services/health-score.service';
import { InsightGeneratorService } from './services/insight-generator.service';
import { ForecastingService } from './services/forecasting.service';
import { AnalyticsSnapshotCron } from './cron/analytics-snapshot.cron';
import {
  RecategorizeDto,
  RecategorizeDtoSwagger,
  RecategorizeSchema,
} from './dto/analytics.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly snapshotService: AnalyticsSnapshotService,
    private readonly categorization: CategorizationService,
    private readonly healthScore: HealthScoreService,
    private readonly insights: InsightGeneratorService,
    private readonly forecasting: ForecastingService,
    private readonly cronRunner: AnalyticsSnapshotCron,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get analytics dashboard — current month, last month, health score, top insights' })
  @ApiResponse({ status: 200, description: 'Dashboard data' })
  async getDashboard(@CurrentUser() user: AuthUser) {
    const { start: currStart, end: currEnd } = this.snapshotService.currentMonthBounds();
    const { start: prevStart, end: prevEnd } = this.snapshotService.lastMonthBounds();

    const [currSnapshot, prevSnapshot, healthScoreData, insightList] = await Promise.all([
      this.snapshotService.getOrComputeSnapshot(user.userId, currStart, currEnd),
      this.snapshotService.getOrComputeSnapshot(user.userId, prevStart, prevEnd),
      this.healthScore.computeHealthScore(user.userId),
      this.insights.getInsightsForUser(user.userId, 5),
    ]);

    const currentMonth = this.snapshotService.buildMonthSummary(currSnapshot, prevSnapshot);
    const lastMonth = this.snapshotService.buildMonthSummary(prevSnapshot);

    return {
      currentMonth,
      lastMonth,
      healthScore: healthScoreData.overall,
      healthScoreBreakdown: healthScoreData,
      insights: insightList,
    };
  }

  @Get('snapshot/current')
  @ApiOperation({ summary: 'Get computed snapshot for the current month' })
  @ApiResponse({ status: 200, description: 'Current month snapshot' })
  async getCurrentMonthSnapshot(@CurrentUser() user: AuthUser) {
    const { start, end } = this.snapshotService.currentMonthBounds();
    const snapshot = await this.snapshotService.getOrComputeSnapshot(user.userId, start, end);
    return this.snapshotService.buildMonthSummary(snapshot);
  }

  @Get('snapshot/last-month')
  @ApiOperation({ summary: 'Get computed snapshot for the previous month' })
  @ApiResponse({ status: 200, description: 'Last month snapshot' })
  async getLastMonthSnapshot(@CurrentUser() user: AuthUser) {
    const { start, end } = this.snapshotService.lastMonthBounds();
    const snapshot = await this.snapshotService.getOrComputeSnapshot(user.userId, start, end);
    return this.snapshotService.buildMonthSummary(snapshot);
  }

  @Get('health-score')
  @ApiOperation({ summary: 'Compute and return the financial health score' })
  @ApiResponse({ status: 200, description: 'Health score breakdown' })
  async getHealthScore(@CurrentUser() user: AuthUser) {
    return this.healthScore.computeHealthScore(user.userId);
  }

  @Get('insights')
  @ApiOperation({ summary: 'Get personalised financial insights (unread / active)' })
  @ApiResponse({ status: 200, description: 'List of insights' })
  async getInsights(@CurrentUser() user: AuthUser) {
    return this.insights.getInsightsForUser(user.userId, 20);
  }

  @Post('insights/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger insight regeneration for the current user' })
  @ApiResponse({ status: 200, description: 'Number of insights generated' })
  async refreshInsights(@CurrentUser() user: AuthUser) {
    const count = await this.insights.generateAndPersistInsights(user.userId);
    return { generated: count };
  }

  @Patch('insights/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark an insight as read' })
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.insights.markInsightRead(id, user.userId);
  }

  @Patch('insights/:id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Dismiss an insight' })
  async dismiss(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.insights.dismissInsight(id, user.userId);
  }

  @Get('forecast')
  @ApiOperation({ summary: 'Linear spend forecast for the rest of the current month by category' })
  @ApiResponse({ status: 200, description: 'Forecast per spending category' })
  async getForecast(@CurrentUser() user: AuthUser) {
    return this.forecasting.forecastCurrentMonth(user.userId);
  }

  @Patch('transactions/:id/category')
  @ApiOperation({ summary: 'Manually recategorise a transaction' })
  @ApiBody({ type: RecategorizeDtoSwagger })
  @ApiResponse({ status: 200, description: 'Transaction category updated' })
  async recategorize(
    @Param('id', ParseUUIDPipe) transactionId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(RecategorizeSchema)) dto: RecategorizeDto,
  ) {
    return this.categorization.recategorizeTransaction(transactionId, user.userId, dto.category);
  }

  @Post('transactions/backfill-categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Auto-categorise uncategorised transactions for the current user' })
  @ApiResponse({ status: 200, description: 'Number of transactions updated' })
  async backfillCategories(@CurrentUser() user: AuthUser) {
    const updated = await this.categorization.backfillCategories(user.userId);
    return { updated };
  }

  // Internal: trigger snapshot + insights for this user on-demand (useful for testing)
  @Post('snapshot/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger snapshot + health score + insight refresh' })
  @ApiResponse({ status: 200, description: 'Refresh complete' })
  async refreshSnapshot(@CurrentUser() user: AuthUser) {
    await this.cronRunner.processUserSnapshot(user.userId);
    return { ok: true };
  }
}

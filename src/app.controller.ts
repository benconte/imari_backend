import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@common/prisma/prisma.service';
import { Public } from '@common/decorators/public.decorator';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Root info' })
  root() {
    return {
      name: 'Imari API',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness + DB readiness probe' })
  async health() {
    let dbStatus: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'up';
    } catch {
      dbStatus = 'down';
    }
    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      services: {
        database: dbStatus,
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}

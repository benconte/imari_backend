import { Controller, Get, Res, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '@common/decorators/public.decorator';
import { DocsService } from './docs.service';

/**
 * OpenAPI Specification Controller
 *
 * Provides the OpenAPI/Swagger specification in JSON format
 * Used by ReDoc, external tools, and API clients
 */
@Controller('docs')
export class DocsController {
  constructor(private readonly docsService: DocsService) {}

  /**
   * Get the OpenAPI specification as JSON
   *
   * Used by:
   * - ReDoc at /redoc
   * - Postman imports
   * - Code generation tools
   * - External API documentation
   */
  @Get('openapi.json')
  @Public()
  @HttpCode(HttpStatus.OK)
  getOpenApiSpec(@Res() res: Response) {
    const spec = this.docsService.getOpenApiSpec();
    res.type('application/json').json(spec);
  }

  /**
   * Health check for documentation endpoints
   */
  @Get('health')
  @Public()
  @HttpCode(HttpStatus.OK)
  getDocsHealth() {
    return this.docsService.getDocsHealth();
  }
}

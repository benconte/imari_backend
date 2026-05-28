import { Module, Global } from '@nestjs/common';
import { RedocController } from './redoc.controller';
import { DocsController } from './docs.controller';
import { DocsService } from './docs.service';

/**
 * Documentation Module
 *
 * Provides alternative API documentation interfaces:
 * - Swagger UI at /docs
 * - ReDoc at /redoc
 * - OpenAPI JSON at /docs/openapi.json
 */
@Global()
@Module({
  controllers: [RedocController, DocsController],
  providers: [DocsService],
  exports: [DocsService],
})
export class DocsModule {}

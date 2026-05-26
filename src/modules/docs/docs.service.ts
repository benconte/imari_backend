import { Injectable } from '@nestjs/common';

/**
 * Documentation Service
 *
 * Manages OpenAPI specification and documentation metadata
 */
@Injectable()
export class DocsService {
  private openApiSpec: Record<string, any> = {};

  /**
   * Set the OpenAPI specification
   * Called from main.ts after Swagger document creation
   */
  setOpenApiSpec(spec: Record<string, any>) {
    this.openApiSpec = spec;
  }

  /**
   * Get the OpenAPI specification
   * Used by ReDoc and external tools
   */
  getOpenApiSpec(): Record<string, any> {
    return this.openApiSpec;
  }

  /**
   * Get documentation endpoints metadata
   */
  getDocsHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      endpoints: {
        swagger: {
          url: '/api/v1/docs',
          description: 'Swagger UI - Interactive API testing',
          type: 'UI',
        },
        redoc: {
          url: '/redoc',
          description: 'ReDoc - Beautiful API documentation',
          type: 'UI',
        },
        openapi: {
          url: '/api/v1/docs/openapi.json',
          description: 'OpenAPI specification in JSON format',
          type: 'JSON',
        },
      },
    };
  }
}

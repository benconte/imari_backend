import { Controller, Get, Res, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { Response, Request } from 'express';
import { Public } from '@common/decorators/public.decorator';

/**
 * ReDoc API Documentation Controller
 *
 * Serves alternative Swagger/OpenAPI documentation using ReDoc
 * ReDoc provides a beautiful, responsive API documentation interface
 */
@Controller('redoc')
export class RedocController {
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  serveRedoc(@Req() req: Request, @Res() res: Response) {
    // Get the base URL from request
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol || 'http';
    const specUrl = `${protocol}://${host}/api/v1/docs/openapi.json`;

    // Disable CSP for ReDoc page since it uses inline styles
    res.removeHeader('Content-Security-Policy');
    
    const redocHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Imari API - ReDoc Documentation</title>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link href="https://fonts.googleapis.com/css?family=Roboto:300,400,700" rel="stylesheet">
          <style>
            html {
              box-sizing: border-box;
              overflow: -moz-scrollbars-vertical;
              overflow-y: scroll;
            }
            *,
            *:before,
            *:after {
              box-sizing: inherit;
            }
            body {
              margin: 0;
              padding: 0;
              background: #f5f5f5;
            }
          </style>
        </head>
        <body>
          <redoc spec-url="${specUrl}"></redoc>
          <script src="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js"></script>
        </body>
      </html>
    `;
    res.type('text/html').send(redocHtml);
  }
}


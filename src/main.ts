import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger, ClassSerializerInterceptor } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from '@common/filters/prisma-exception.filter';
import { TransformInterceptor } from '@common/interceptors/transform.interceptor';
import { LoggingInterceptor } from '@common/interceptors/logging.interceptor';
import { DocsService } from '@modules/docs/docs.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);
  const apiPrefix = config.get<string>('app.apiPrefix', 'api/v1');
  const nodeEnv = config.get<string>('app.nodeEnv', 'development');

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        },
      },
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.enableCors({
    origin: true, // tighten for production
    credentials: true,
  });

  // Global API prefix
  app.setGlobalPrefix(apiPrefix);

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filters (order: most specific first)
  app.useGlobalFilters(new PrismaExceptionFilter(), new AllExceptionsFilter());

  // Global interceptors
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ClassSerializerInterceptor(reflector),
    new TransformInterceptor(),
  );

  // Swagger & ReDoc (disabled in production)
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Imari API')
      .setDescription('Intelligent Digital Banking & Financial Lifestyle Platform')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    
    // Swagger UI at /api/v1/docs
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
    
    // Store spec in DocsService for ReDoc and external tools to access
    const docsService = app.get(DocsService);
    docsService.setOpenApiSpec(document);
  }

  app.enableShutdownHooks();

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 Imari API running at http://localhost:${port}/${apiPrefix}`);
  if (nodeEnv !== 'production') {
    logger.log(`📘 Swagger UI at http://localhost:${port}/${apiPrefix}/docs`);
    logger.log(`📕 ReDoc at    http://localhost:${port}/redoc`);
  }
}

bootstrap();

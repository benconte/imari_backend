import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

type PrismaError =
  | Prisma.PrismaClientKnownRequestError
  | Prisma.PrismaClientValidationError;

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: PrismaError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error';
    let errorCode = 'DATABASE_ERROR';

    if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid query payload';
      errorCode = 'PRISMA_VALIDATION_ERROR';
    } else {
      switch (exception.code) {
        case 'P2002': {
          const target = (exception.meta?.target as string[] | undefined)?.join(', ');
          status = HttpStatus.CONFLICT;
          message = target
            ? `Value already exists for: ${target}`
            : 'Value already exists';
          errorCode = 'UNIQUE_CONSTRAINT';
          break;
        }
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Record not found';
          errorCode = 'NOT_FOUND';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Foreign key constraint failed';
          errorCode = 'FOREIGN_KEY_VIOLATION';
          break;
        case 'P2034':
          status = HttpStatus.CONFLICT;
          message = 'Transaction conflict, please retry';
          errorCode = 'TRANSACTION_CONFLICT';
          break;
        default:
          message =
            process.env.NODE_ENV === 'production'
              ? 'Database error'
              : (exception.message.split('\n').pop()?.trim() ?? message);
      }
    }

    this.logger.error(
      `Prisma ${(exception as Prisma.PrismaClientKnownRequestError).code ?? 'validation'}: ${message}`,
    );

    response.status(status).json({
      success: false,
      statusCode: status,
      errorCode,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

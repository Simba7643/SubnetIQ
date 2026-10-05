import type { ErrorRequestHandler, Request, RequestHandler, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@subnetiq/shared';
import type { Logger } from '../observability/logger.js';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (request, response, next) => {
    void Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    if (response.headersSent) {
      response.end();
      return;
    }
    let failure: AppError;
    if (error instanceof AppError) failure = error;
    else if (error instanceof ZodError)
      failure = new AppError(
        400,
        'VALIDATION_ERROR',
        'Check the highlighted input fields.',
        error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      );
    else if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large'
    )
      failure = new AppError(
        413,
        'PAYLOAD_TOO_LARGE',
        `The request exceeds the ${'limit' in error && error.limit === 2359296 ? '2.25 MiB project' : '512 KiB'} limit. Split the import into smaller parts.`,
      );
    else if (error instanceof SyntaxError && 'body' in error)
      failure = new AppError(400, 'INVALID_JSON', 'The request body must contain valid JSON.');
    else
      failure = new AppError(
        500,
        'INTERNAL_ERROR',
        'The request could not be completed. Retry using the request ID if you contact support.',
      );
    const requestId =
      typeof response.locals.requestId === 'string' ? response.locals.requestId : undefined;
    if (failure.status >= 500)
      logger.error({ event: 'request_error', code: failure.code, requestId });
    const body: ApiErrorBody = {
      error: {
        code: failure.code,
        message: failure.message,
        requestId,
        ...(failure.details === undefined ? {} : { details: failure.details }),
      },
    };
    response.status(failure.status).json(body);
  };
}

export function unwrap<T>(result: {
  data: T;
  error: { code?: string; message?: string } | null;
}): NonNullable<T> {
  if (result.error) {
    const code = result.error.code;
    if (code === 'PGRST116' || code === 'P0002')
      throw new AppError(404, 'NOT_FOUND', 'This item does not exist or you do not have access.');
    if (code === '40001')
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'This project changed in another session. Reload it before saving.',
      );
    if (code === '23505')
      throw new AppError(409, 'CONFLICT', 'An item with this value already exists.');
    if (code === '42501')
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
    if (['23503', '23514', '22023', '22P02'].includes(code ?? ''))
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'The submitted values or related records are invalid.',
      );
    throw new AppError(
      503,
      'DATABASE_UNAVAILABLE',
      'The database could not complete this request. Check migrations and configuration, then retry.',
    );
  }
  if (result.data === null)
    throw new AppError(404, 'NOT_FOUND', 'This item does not exist or you do not have access.');
  return result.data as NonNullable<T>;
}

import { Request, Response, NextFunction } from 'express';
import { DomainError } from '../modules/shared/DomainError';

interface ErrorResponse {
  error: string;
  message?: string;
  statusCode?: number;
}

export function errorHandler(
  err: Error | DomainError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error:', err);

  let statusCode = 500;
  let message = 'Internal server error';
  let errorType = 'InternalServerError';

  if (err instanceof DomainError) {
    statusCode = err.statusCode || 500;
    message = err.message;
    errorType = 'DomainError';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
    errorType = 'ValidationError';
  } else if (err.name === 'UnauthorizedError' || err.message.includes('jwt')) {
    statusCode = 401;
    message = 'Unauthorized';
    errorType = 'UnauthorizedError';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    message = 'Forbidden';
    errorType = 'ForbiddenError';
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    message = 'Not Found';
    errorType = 'NotFoundError';
  }

  const response: ErrorResponse = {
    error: errorType,
    message,
    statusCode
  };

  res.status(statusCode).json(response);
}

export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({
    error: 'NotFoundError',
    message: `Route ${req.method} ${req.path} not found`,
    statusCode: 404
  });
}

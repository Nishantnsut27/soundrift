import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import * as Sentry from '@sentry/node';
import { AppError } from '../utils/AppError.js';

const GENERIC_ERROR_MESSAGE = 'An internal server error occurred while processing your request.';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const classifyError = (err: any): { statusCode: number; message: string; code?: string } => {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, message: err.message, code: err.code };
  }
  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? { statusCode: 413, message: 'Image is too large. The maximum size is 5 MB.' }
      : { statusCode: 400, message: 'Invalid file upload.' };
  }
  if (err instanceof mongoose.Error.CastError) {
    return { statusCode: 400, message: 'Invalid identifier.' };
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const firstIssue = Object.values(err.errors)[0];
    return { statusCode: 400, message: firstIssue?.message || 'Invalid input.' };
  }
  if (err instanceof mongoose.Error.VersionError) {
    return { statusCode: 409, message: 'This item was changed by another request. Please try again.' };
  }
  if (err?.code === 11000) {
    return { statusCode: 409, message: 'This record already exists.' };
  }

  const rawStatus = Number(err?.statusCode || err?.status);
  const statusCode = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
  // Driver/library messages can expose internals (collection names, hosts), so only 4xx messages are echoed.
  return { statusCode, message: statusCode < 500 ? err?.message || GENERIC_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function errorHandlerMiddleware(err: any, _req: Request, res: Response, next: NextFunction): void {
  console.error('[BackendServerError]', err?.name || 'Error', err?.message || err);

  const { statusCode, message, code } = classifyError(err);
  if (statusCode >= 500) {
    Sentry.captureException(err);
  }

  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(code ? { code } : {}),
  });
}

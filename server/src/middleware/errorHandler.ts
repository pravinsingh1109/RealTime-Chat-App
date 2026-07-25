import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MongoServerError } from 'mongodb';
import multer from 'multer';
import { ZodError } from 'zod';

import { env } from '../config/env.js';
import { ApiError } from '../errors/ApiError.js';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new ApiError(404, `Route ${request.method} ${request.originalUrl} was not found.`, 'NOT_FOUND'));
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  let apiError: ApiError;

  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof ZodError) {
    apiError = new ApiError(400, 'Request validation failed.', 'VALIDATION_ERROR', error.flatten());
  } else if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? `Image files must not exceed ${env.MAX_FILE_SIZE_MB} MB.`
      : 'Upload failed.';
    apiError = new ApiError(400, message, 'UPLOAD_ERROR');
  } else if (error instanceof MongoServerError && error.code === 11000) {
    apiError = new ApiError(409, 'That resource already exists.', 'DUPLICATE_RESOURCE');
  } else if (error && typeof error === 'object' && 'name' in error && error.name === 'ValidationError') {
    apiError = new ApiError(400, 'Data validation failed.', 'VALIDATION_ERROR');
  } else {
    apiError = new ApiError(500, 'An unexpected server error occurred.', 'INTERNAL_ERROR');
  }

  const body: {
    error: { code: string; message: string; details?: unknown; stack?: string };
  } = {
    error: {
      code: apiError.code,
      message: apiError.message
    }
  };

  if (apiError.details !== undefined) body.error.details = apiError.details;
  if (env.NODE_ENV !== 'production' && error instanceof Error) body.error.stack = error.stack;

  response.status(apiError.statusCode).json(body);
};

import type { RequestHandler } from 'express';

import { ApiError } from '../errors/ApiError.js';
import { deleteUploadedFile, ensureVerifiedImage } from '../middleware/upload.js';

export const uploadImage: RequestHandler = async (request, response) => {
  if (!request.file) {
    throw new ApiError(400, 'An image file is required in the image field.', 'IMAGE_REQUIRED');
  }

  try {
    await ensureVerifiedImage(request.file);
  } catch (error) {
    await deleteUploadedFile(request.file.path);
    throw error;
  }

  response.status(201).json({ url: `/uploads/${request.file.filename}` });
};

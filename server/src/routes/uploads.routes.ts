import { Router } from 'express';
import { uploadImage } from '../controllers/uploads.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const uploadsRouter = Router();
uploadsRouter.post('/image', requireAuth, imageUpload.single('image'), asyncHandler(uploadImage));

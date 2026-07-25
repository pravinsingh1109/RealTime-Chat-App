import { mkdirSync } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import multer from 'multer';

import { env } from '../config/env.js';
import { ApiError } from '../errors/ApiError.js';

export const uploadDirectory = path.resolve(process.cwd(), env.UPLOAD_DIR);

mkdirSync(uploadDirectory, { recursive: true });

const imageExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp'
};

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadDirectory),
  filename: (_request, file, callback) => {
    const extension = imageExtensions[file.mimetype];
    callback(null, `${randomUUID()}${extension ?? ''}`);
  }
});

export const imageUpload = multer({
  storage,
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1
  },
  fileFilter: (_request, file, callback) => {
    if (!imageExtensions[file.mimetype]) {
      callback(new ApiError(400, 'Only JPEG, PNG, GIF, and WebP images are allowed.', 'UNSUPPORTED_FILE_TYPE'));
      return;
    }
    callback(null, true);
  }
});

function matchesSignature(buffer: Buffer, mimeType: string): boolean {
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isGif = buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a');
  const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  return (mimeType === 'image/jpeg' && isJpeg)
    || (mimeType === 'image/png' && isPng)
    || (mimeType === 'image/gif' && isGif)
    || (mimeType === 'image/webp' && isWebp);
}

export async function ensureVerifiedImage(file: Express.Multer.File): Promise<void> {
  const handle = await open(file.path, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (!matchesSignature(header.subarray(0, bytesRead), file.mimetype)) {
      throw new ApiError(400, 'The uploaded file does not match its declared image type.', 'INVALID_IMAGE_CONTENT');
    }
  } finally {
    await handle.close();
  }
}

export async function deleteUploadedFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

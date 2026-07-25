import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import { ApiError } from './errors.js';

export function requireObjectId(value: string, fieldName = 'id'): Types.ObjectId {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(400, `Invalid ${fieldName}.`, 'INVALID_ID');
  }

  return new mongoose.Types.ObjectId(value);
}

export function canonicalDirectKey(firstUserId: string, secondUserId: string): string {
  return [firstUserId, secondUserId].sort().join(':');
}


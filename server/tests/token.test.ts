import { expect, test } from '@jest/globals';
import { signAccessToken, verifyAccessToken } from '../src/utils/token.js';
test('access tokens retain the subject', () => expect(verifyAccessToken(signAccessToken('507f1f77bcf86cd799439011'))).toEqual({ userId: '507f1f77bcf86cd799439011' }));

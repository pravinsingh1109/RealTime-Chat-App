import type { AuthenticatedUser } from '../utils/token.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

export {};

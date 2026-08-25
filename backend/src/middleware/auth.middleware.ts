import { Request, Response, NextFunction } from 'express';
import { verifyAuthToken } from '../utils/token.utils.js';
import { User, IUser } from '../models/user.model.js';

export interface AuthenticatedRequest extends Request {
  user?: IUser;
}

export const authenticateUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // 1. Check HTTP-only cookie
    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    // 2. Check Authorization Bearer header fallback
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.',
      });
      return;
    }

    // 3. Verify JWT token payload
    const decoded = verifyAuthToken(token);

    // 4. Look up user in MongoDB Atlas
    const user = await User.findById(decoded.userId);

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User associated with this token no longer exists.',
      });
      return;
    }

    if (user.accountStatus !== 'active') {
      res.status(403).json({
        success: false,
        error: 'Your account is currently suspended or inactive.',
      });
      return;
    }

    // Attach user to Request
    req.user = user;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired authentication session. Please log in again.',
    });
  }
};

export const attachUserIfPresent = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      const decoded = verifyAuthToken(token);
      const user = await User.findById(decoded.userId);
      if (user) {
        req.user = user;
      }
    }
  } catch {
    req.user = undefined;
  }

  next();
};

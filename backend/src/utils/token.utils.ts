import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { config } from '../config/config.js';

export interface TokenPayload {
  userId: string;
  role: string;
}

export const generateAccessToken = (userId: string, role: string = 'user'): string => {
  return jwt.sign(
    { userId, role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
  );
};

export const generateRefreshToken = (userId: string, role: string = 'user'): string => {
  return jwt.sign(
    { userId, role },
    config.refreshTokenSecret,
    { expiresIn: config.refreshTokenExpiresIn as jwt.SignOptions['expiresIn'] }
  );
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.refreshTokenSecret) as TokenPayload;
};

// Backward-compatible alias
export const verifyAuthToken = verifyAccessToken;

export const ACCESS_TOKEN_COOKIE_PATH = '/';
export const REFRESH_TOKEN_COOKIE_PATH = '/api/auth';
const LEGACY_REFRESH_TOKEN_COOKIE_PATH = '/api/auth/refresh';

const baseCookieOptions = () => {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
  };
};

export const setAuthCookies = (res: Response, accessToken: string, refreshToken: string): void => {
  const options = baseCookieOptions();

  res.cookie('auth_token', accessToken, {
    ...options,
    maxAge: 15 * 60 * 1000,
    path: ACCESS_TOKEN_COOKIE_PATH,
  });

  res.cookie('refresh_token', refreshToken, {
    ...options,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: REFRESH_TOKEN_COOKIE_PATH,
  });
};

export const clearAuthCookies = (res: Response): void => {
  const options = baseCookieOptions();

  res.clearCookie('auth_token', { ...options, path: ACCESS_TOKEN_COOKIE_PATH });
  res.clearCookie('refresh_token', { ...options, path: REFRESH_TOKEN_COOKIE_PATH });
  res.clearCookie('refresh_token', { ...options, path: LEGACY_REFRESH_TOKEN_COOKIE_PATH });
};

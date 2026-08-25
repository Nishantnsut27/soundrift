import { Request, Response, NextFunction } from 'express';

interface ViolationRecord {
  count: number;
  expiresAt: number;
}

const VIOLATION_WINDOW_MS = 15 * 60 * 1000;
const VIOLATION_THRESHOLD = 50;
const MAX_TRACKED_IPS = 10000;

const suspiciousIpViolationMap = new Map<string, ViolationRecord>();

const getClientIp = (req: Request): string => req.ip || req.socket.remoteAddress || 'unknown';

const pruneExpiredViolations = (now: number): void => {
  for (const [ip, record] of suspiciousIpViolationMap) {
    if (record.expiresAt <= now) {
      suspiciousIpViolationMap.delete(ip);
    }
  }
};

export function botProtectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const record = suspiciousIpViolationMap.get(clientIp);

  if (record && record.expiresAt > now && record.count > VIOLATION_THRESHOLD) {
    res.status(429).json({
      success: false,
      error: 'Excessive abusive requests detected. IP temporarily restricted.'
    });
    return;
  }

  const userAgent = req.headers['user-agent'] || '';

  if (!userAgent || userAgent.trim().length === 0) {
    recordIpViolation(clientIp);
    res.status(400).json({
      success: false,
      error: 'Invalid request headers: Missing User-Agent.'
    });
    return;
  }

  next();
}

export function recordIpViolation(ip: string): void {
  const now = Date.now();
  const existing = suspiciousIpViolationMap.get(ip);

  if (existing && existing.expiresAt > now) {
    existing.count += 1;
    existing.expiresAt = now + VIOLATION_WINDOW_MS;
  } else {
    suspiciousIpViolationMap.set(ip, { count: 1, expiresAt: now + VIOLATION_WINDOW_MS });
  }

  if (suspiciousIpViolationMap.size > MAX_TRACKED_IPS) {
    pruneExpiredViolations(now);
    if (suspiciousIpViolationMap.size > MAX_TRACKED_IPS) {
      suspiciousIpViolationMap.clear();
    }
  }
}

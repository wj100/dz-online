import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface TokenPayload {
  userId: string;
  username: string;
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    return null;
  }
}

export function authFromHeader(authHeader: string | undefined): TokenPayload | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.slice(7));
}

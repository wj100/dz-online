import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { authFromHeader, hashPassword, signToken, verifyPassword } from './auth.js';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const name = username.trim();
  if (name.length < 2 || name.length > 16) {
    return res.status(400).json({ error: '用户名长度需在 2~16 之间' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  const exists = await prisma.user.findUnique({ where: { username: name } });
  if (exists) return res.status(409).json({ error: '用户名已存在' });

  const user = await prisma.user.create({
    data: { username: name, passwordHash: hashPassword(password), chips: config.startChips },
  });
  const token = signToken({ userId: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username, chips: user.chips } });
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const user = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = signToken({ userId: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username, chips: user.chips } });
});

authRouter.get('/me', async (req, res) => {
  const payload = authFromHeader(req.headers.authorization);
  if (!payload) return res.status(401).json({ error: '未登录' });
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) return res.status(401).json({ error: '用户不存在' });
  res.json({ user: { id: user.id, username: user.username, chips: user.chips } });
});

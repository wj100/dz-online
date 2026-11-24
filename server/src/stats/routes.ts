import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { authFromHeader } from '../auth/auth.js';

export const statsRouter = Router();

statsRouter.use((req, res, next) => {
  const payload = authFromHeader(req.headers.authorization);
  if (!payload) return res.status(401).json({ error: '未登录' });
  next();
});

statsRouter.get('/sessions', async (_req, res) => {
  const sessions = await prisma.gameSession.findMany({
    orderBy: { startedAt: 'desc' },
    take: 100,
    include: { _count: { select: { players: true } } },
  });
  res.json({
    sessions: sessions
      .filter((s) => s._count.players > 0)
      .map((s) => ({
        id: s.id,
        playerCount: s._count.players,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
      })),
  });
});

statsRouter.get('/sessions/:id', async (req, res) => {
  const session = await prisma.gameSession.findUnique({
    where: { id: req.params.id },
    include: { players: { orderBy: { netProfit: 'desc' } } },
  });
  if (!session) return res.status(404).json({ error: '对局不存在' });
  res.json({
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    players: session.players.map((p) => ({
      username: p.username,
      buyInTotal: p.buyInTotal,
      finalChips: p.finalChips,
      netProfit: p.netProfit,
      vpip: p.vpip,
      handsPlayed: p.handsPlayed,
      handsWon: p.handsWon,
    })),
  });
});

statsRouter.get('/leaderboard', async (_req, res) => {
  const grouped = await prisma.gameSessionPlayer.groupBy({
    by: ['userId', 'username'],
    _sum: { netProfit: true, handsPlayed: true, handsWon: true },
  });
  const rows = grouped
    .map((g) => {
      const handsPlayed = g._sum.handsPlayed ?? 0;
      const handsWon = g._sum.handsWon ?? 0;
      return {
        userId: g.userId,
        username: g.username,
        netProfit: g._sum.netProfit ?? 0,
        handsPlayed,
        handsWon,
        winRate: handsPlayed > 0 ? handsWon / handsPlayed : 0,
      };
    })
    .sort((a, b) => b.netProfit - a.netProfit);
  res.json({ leaderboard: rows });
});

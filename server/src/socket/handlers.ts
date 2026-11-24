import type { Server, Socket } from 'socket.io';
import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { verifyToken } from '../auth/auth.js';
import { RoomManager } from '../room/roomManager.js';
import type { PlayerStats, Room } from '../room/room.js';

export function registerSocketHandlers(io: Server, manager: RoomManager): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const payload = token ? verifyToken(token) : null;
    if (!payload) return next(new Error('unauthorized'));
    socket.data.userId = payload.userId;
    socket.data.username = payload.username;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    const username = socket.data.username as string;
    manager.registerSocket(userId, socket.id);

    const existing = manager.getRoomByUser(userId);
    if (existing) {
      socket.join(existing.id);
      existing.markConnected(userId, true);
      socket.emit('game:snapshot', existing.snapshotFor(userId));
      existing.broadcastState();
    }

    socket.on('room:create', async (opts, cb) => {
      const current = manager.getRoomByUser(userId);
      if (current) return cb?.({ ok: false, error: '你已在房间中，请先离开' });
      const room = await manager.createRoom({ id: userId, username }, opts);
      const res = await seatUser(manager, room, userId, username);
      if (!res.ok) return cb?.({ ok: false, error: res.error });
      socket.join(room.id);
      room.broadcastState();
      cb?.({ ok: true, roomId: room.id, inviteCode: room.inviteCode });
    });

    socket.on('room:join', async (code, cb) => {
      const room = manager.getRoomByCode(String(code || ''));
      if (!room) return cb?.({ ok: false, error: '房间不存在' });
      const res = await seatUser(manager, room, userId, username);
      if (!res.ok) return cb?.({ ok: false, error: res.error });
      socket.join(room.id);
      room.broadcastState();
      cb?.({ ok: true, roomId: room.id });
    });

    socket.on('room:leave', async (_payload, cb) => {
      const room = manager.getRoomByUser(userId);
      if (!room) return cb?.({ ok: false, error: '你不在任何房间' });
      const res = room.removePlayer(userId);
      if (res.ok) {
        socket.leave(room.id);
        manager.clearUserRoom(userId);
        if (res.refund) await refundToBank(userId, res.refund);
        if (res.stats) await savePlayerStats(room.sessionId, res.stats);
        room.broadcastState();
        await manager.deleteRoomIfEmpty(room);
      }
      cb?.({ ok: res.ok, refund: res.refund ?? 0, error: res.error });
    });

    socket.on('room:start', (_payload, cb) => {
      const room = manager.getRoomByUser(userId);
      if (!room) return cb?.({ ok: false, error: '你不在任何房间' });
      if (room.hostId !== userId) return cb?.({ ok: false, error: '只有房主能开始' });
      cb?.(room.startGame());
    });

    socket.on('game:act', (payload, cb) => {
      const room = manager.getRoomByUser(userId);
      if (!room) return cb?.({ ok: false, error: '你不在任何房间' });
      const { action, amount } = (payload ?? {}) as { action: string; amount?: number };
      room.handleAction(userId, action as never, amount);
      cb?.({ ok: true });
    });

    socket.on('game:rebuy', async (_payload, cb) => {
      const room = manager.getRoomByUser(userId);
      if (!room) return cb?.({ ok: false, error: '你不在任何房间' });
      const amount = config.buyIn;
      room.rebuy(userId, amount);
      room.broadcastState();
      cb?.({ ok: true, amount });
    });

    socket.on('disconnect', () => {
      manager.unregisterSocket(userId, socket.id);
      const room = manager.getRoomByUser(userId);
      if (room) {
        socket.leave(room.id);
        room.markConnected(userId, false);
      }
    });
  });
}

async function seatUser(
  manager: RoomManager,
  room: Room,
  userId: string,
  username: string,
): Promise<{ ok: boolean; error?: string }> {
  const existing = manager.getRoomByUser(userId);
  if (existing && existing.id !== room.id) return { ok: false, error: '你已在其他房间' };
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: '用户不存在' };
  const buyIn = Math.min(user.chips, room.buyIn);
  if (buyIn <= 0) return { ok: false, error: '筹码不足，请先重置' };
  const res = room.addPlayer({ id: userId, username }, buyIn);
  if (!res.ok) return { ok: false, error: res.error };
  await prisma.user.update({
    where: { id: userId },
    data: { chips: user.chips - buyIn, inPlayChips: user.inPlayChips + buyIn },
  });
  manager.setUserRoom(userId, room.id);
  return { ok: true };
}

async function refundToBank(userId: string, amount: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { chips: { increment: amount }, inPlayChips: 0 },
  });
}

async function savePlayerStats(sessionId: string, stats: PlayerStats): Promise<void> {
  await prisma.gameSessionPlayer.create({
    data: {
      sessionId,
      userId: stats.userId,
      username: stats.username,
      buyInTotal: stats.buyInTotal,
      finalChips: stats.finalChips,
      netProfit: stats.netProfit,
      vpip: stats.vpip,
      handsPlayed: stats.handsPlayed,
      handsWon: stats.handsWon,
    },
  });
}

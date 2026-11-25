import { randomUUID } from 'crypto';
import type { Server } from 'socket.io';
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';
import { Room, type PlayerStats, type RoomUser } from './room.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly roomByCode = new Map<string, string>();
  private readonly roomByUser = new Map<string, string>();
  private readonly socketByUser = new Map<string, string>();
  private readonly io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  private emitTo = (userId: string, event: string, data: unknown): void => {
    const socketId = this.socketByUser.get(userId);
    if (socketId) this.io.to(socketId).emit(event, data);
  };

  async createRoom(
    host: RoomUser,
    opts?: { maxSeats?: number; smallBlind?: number; bigBlind?: number; flexible?: boolean },
  ): Promise<Room> {
    const id = randomUUID();
    let inviteCode = generateInviteCode();
    while (this.roomByCode.has(inviteCode)) inviteCode = generateInviteCode();

    const session = await prisma.gameSession.create({
      data: { roomId: id },
    });

    const flexible = opts?.flexible ?? false;
    let room: Room;
    room = new Room({
      id,
      inviteCode,
      hostId: host.id,
      sessionId: session.id,
      maxSeats: flexible ? config.flexMaxSeats : (opts?.maxSeats ?? config.defaultMaxSeats),
      flexible,
      smallBlind: opts?.smallBlind ?? config.defaultSmallBlind,
      bigBlind: opts?.bigBlind ?? config.defaultBigBlind,
      buyIn: config.buyIn,
      actionTimeoutMs: config.actionTimeoutMs,
      emitTo: this.emitTo,
      onAutoKick: (userId, refund, stats) => {
        void this.handleAutoKick(room, userId, refund, stats);
      },
    });
    this.rooms.set(id, room);
    this.roomByCode.set(inviteCode, id);
    return room;
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  getRoomByCode(code: string): Room | undefined {
    const id = this.roomByCode.get(String(code).toUpperCase());
    return id ? this.rooms.get(id) : undefined;
  }

  getRoomByUser(userId: string): Room | undefined {
    const id = this.roomByUser.get(userId);
    return id ? this.rooms.get(id) : undefined;
  }

  setUserRoom(userId: string, roomId: string): void {
    this.roomByUser.set(userId, roomId);
  }

  clearUserRoom(userId: string): void {
    this.roomByUser.delete(userId);
  }

  registerSocket(userId: string, socketId: string): void {
    this.socketByUser.set(userId, socketId);
  }

  unregisterSocket(userId: string, socketId: string): void {
    if (this.socketByUser.get(userId) === socketId) this.socketByUser.delete(userId);
  }

  async deleteRoomIfEmpty(room: Room): Promise<boolean> {
    if (room.playerCount === 0) {
      this.rooms.delete(room.id);
      this.roomByCode.delete(room.inviteCode);
      const count = await prisma.gameSessionPlayer.count({ where: { sessionId: room.sessionId } });
      await prisma.gameSession.update({
        where: { id: room.sessionId },
        data: { endedAt: new Date(), playerCount: count },
      });
      return true;
    }
    return false;
  }

  private async handleAutoKick(room: Room, userId: string, refund: number, stats: PlayerStats): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { chips: { increment: refund }, inPlayChips: 0 },
    });
    await prisma.gameSessionPlayer.create({
      data: {
        sessionId: room.sessionId,
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
    this.clearUserRoom(userId);
    await this.deleteRoomIfEmpty(room);
    console.log(`[room ${room.id}] 玩家掉线超时已自动移出: ${stats.username}`);
  }
}

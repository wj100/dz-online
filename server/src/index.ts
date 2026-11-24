import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config.js';
import { authRouter } from './auth/routes.js';
import { statsRouter } from './stats/routes.js';
import { prisma } from './db/prisma.js';
import { RoomManager } from './room/roomManager.js';
import { registerSocketHandlers } from './socket/handlers.js';

const app = express();
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json());
app.use('/api', authRouter);
app.use('/api/stats', statsRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.clientOrigin, credentials: true },
});

const manager = new RoomManager(io);
registerSocketHandlers(io, manager);

async function recoverOrphanChips(): Promise<void> {
  const result = await prisma.$executeRaw`UPDATE "User" SET "chips" = "chips" + "inPlayChips", "inPlayChips" = 0 WHERE "inPlayChips" > 0`;
  if (result > 0) console.log(`[dz-online] 启动回收孤儿筹码：${result} 个用户`);
}

await recoverOrphanChips();

server.listen(config.port, () => {
  console.log(`[dz-online] 服务已启动: http://localhost:${config.port}`);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

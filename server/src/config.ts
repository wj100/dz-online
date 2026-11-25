import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  startChips: 1000,
  buyIn: 1000,
  defaultMaxSeats: 6,
  flexMaxSeats: 9,
  defaultSmallBlind: 5,
  defaultBigBlind: 10,
  actionTimeoutMs: 30_000,
  disconnectKickMs: 60_000,
};

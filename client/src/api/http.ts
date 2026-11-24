import axios from 'axios';

export interface UserInfo {
  id: string;
  username: string;
  chips: number;
}

export const http = axios.create({ baseURL: '/api' });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('dz_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface AuthResponse {
  token: string;
  user: UserInfo;
}

export async function register(username: string, password: string): Promise<AuthResponse> {
  const { data } = await http.post('/register', { username, password });
  return data;
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const { data } = await http.post('/login', { username, password });
  return data;
}

export async function fetchMe(): Promise<UserInfo> {
  const { data } = await http.get('/me');
  return data.user;
}

export async function resetChips(): Promise<UserInfo> {
  const { data } = await http.post('/reset-chips');
  return data.user;
}

export interface SessionSummary {
  id: string;
  playerCount: number;
  startedAt: string;
  endedAt: string;
}

export interface SessionPlayer {
  username: string;
  buyInTotal: number;
  finalChips: number;
  netProfit: number;
  vpip: number;
  handsPlayed: number;
  handsWon: number;
}

export interface SessionDetail {
  id: string;
  startedAt: string;
  endedAt: string;
  players: SessionPlayer[];
}

export interface LeaderboardRow {
  userId: string;
  username: string;
  netProfit: number;
  handsPlayed: number;
  handsWon: number;
  winRate: number;
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const { data } = await http.get('/stats/sessions');
  return data.sessions;
}

export async function fetchSessionDetail(id: string): Promise<SessionDetail> {
  const { data } = await http.get(`/stats/sessions/${id}`);
  return data;
}

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const { data } = await http.get('/stats/leaderboard');
  return data.leaderboard;
}

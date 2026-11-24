import type { Card, EvalResult } from './cards.js';

export type Stage = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface SeatState {
  seat: number; // 座位索引，恒等于 seats 数组下标
  userId: string | null; // null 表示空位
  username: string;
  chips: number; // 桌上剩余筹码（不含本局已投入）
  cards: Card[];
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  betThisRound: number; // 当前街已投入
  contributed: number; // 本局累计投入
  sittingOut: boolean; // 离席挂机（下局自动跳过）
  connected: boolean; // socket 是否在线
  lastAction: string;
  bestHand: EvalResult | null;
  buyInTotal: number; // 累计买入（buy-in + rebuy）
  handsPlayed: number; // 参与手数
  vpipHands: number; // 主动入池手数
  handsWon: number; // 赢的手数
  currentHandVpip: boolean; // 当前手是否主动入池（本手重置）
}

export interface WinnerInfo {
  seat: number;
  amount: number;
  hand?: EvalResult;
}

export interface HandState {
  stage: Stage;
  community: Card[];
  deck: Card[];
  currentBet: number;
  minRaise: number;
  dealer: number;
  activeSeat: number;
  handNo: number;
  winners: WinnerInfo[];
  lastAction: { seat: number; action: string; amount?: number } | null;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

export interface PublicSeatView {
  seat: number;
  username: string;
  chips: number;
  folded: boolean;
  allIn: boolean;
  betThisRound: number;
  sittingOut: boolean;
  connected: boolean;
  isHost: boolean;
  lastAction: string;
  cardCount: number;
  cards?: Card[]; // 仅本人 + 摊牌时可见
  bestHand?: EvalResult;
  isWinner: boolean;
}

export interface GameSnapshot {
  roomId: string;
  inviteCode: string;
  status: 'waiting' | 'playing' | 'showdown';
  stage: Stage;
  seats: PublicSeatView[];
  community: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  dealer: number;
  activeSeat: number;
  handNo: number;
  winners: WinnerInfo[];
  lastAction: { seat: number; action: string; amount?: number } | null;
  legalActions: LegalActions | null; // 仅当前行动者非空
  yourSeat: number;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
}

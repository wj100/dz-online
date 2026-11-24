export type Suit = '♠' | '♥' | '♦' | '♣';

export interface Card {
  r: number;
  s: Suit;
}

export interface EvalResult {
  category: number;
  ranks: number[];
}

export type Stage = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allin';

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
  cards?: Card[];
  bestHand?: EvalResult;
  isWinner: boolean;
}

export interface WinnerInfo {
  seat: number;
  amount: number;
  hand?: EvalResult;
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
  legalActions: LegalActions | null;
  yourSeat: number;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
}

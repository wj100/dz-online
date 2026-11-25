import {
  activeSeats,
  advanceStreet,
  applyAction,
  computeLegalActions,
  endHand,
  nextActor,
  roundDone,
  startHand,
  totalPot,
} from '../game/engine.js';
import type { ActionType, GameSnapshot, HandState, LegalActions, PublicSeatView, SeatState } from '../game/types.js';
import { config } from '../config.js';

export interface RoomUser {
  id: string;
  username: string;
}

export interface PlayerStats {
  userId: string;
  username: string;
  buyInTotal: number;
  finalChips: number;
  netProfit: number;
  vpip: number;
  handsPlayed: number;
  handsWon: number;
}

interface RoomOptions {
  id: string;
  inviteCode: string;
  hostId: string;
  sessionId: string;
  maxSeats: number;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  flexible: boolean;
  actionTimeoutMs: number;
  emitTo: (userId: string, event: string, data: unknown) => void;
  onAutoKick?: (userId: string, refund: number, stats: PlayerStats) => void;
}

export class Room {
  readonly id: string;
  readonly inviteCode: string;
  readonly hostId: string;
  readonly sessionId: string;
  readonly maxSeats: number;
  readonly flexible: boolean;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly buyIn: number;
  readonly actionTimeoutMs: number;
  status: 'waiting' | 'playing' = 'waiting';
  seats: SeatState[] = [];
  handState: HandState;
  private readonly emitTo: RoomOptions['emitTo'];
  private readonly onAutoKick?: RoomOptions['onAutoKick'];
  private timer: NodeJS.Timeout | null = null;
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly kickAfterHand = new Set<string>();

  constructor(opts: RoomOptions) {
    this.id = opts.id;
    this.inviteCode = opts.inviteCode;
    this.hostId = opts.hostId;
    this.sessionId = opts.sessionId;
    this.maxSeats = opts.maxSeats;
    this.flexible = opts.flexible;
    this.smallBlind = opts.smallBlind;
    this.bigBlind = opts.bigBlind;
    this.buyIn = opts.buyIn;
    this.actionTimeoutMs = opts.actionTimeoutMs;
    this.emitTo = opts.emitTo;
    this.onAutoKick = opts.onAutoKick;
    this.seats = this.flexible ? [] : Array.from({ length: this.maxSeats }, (_, i) => this.emptySeat(i));
    this.handState = this.emptyHand();
  }

  private emptySeat(seat: number): SeatState {
    return {
      seat,
      userId: null,
      username: '',
      chips: 0,
      cards: [],
      folded: false,
      allIn: false,
      acted: false,
      betThisRound: 0,
      contributed: 0,
      sittingOut: false,
      connected: false,
      lastAction: '',
      bestHand: null,
      buyInTotal: 0,
      handsPlayed: 0,
      vpipHands: 0,
      handsWon: 0,
      currentHandVpip: false,
    };
  }

  private emptyHand(): HandState {
    return {
      stage: 'waiting',
      community: [],
      deck: [],
      currentBet: 0,
      minRaise: this.bigBlind,
      dealer: -1,
      activeSeat: -1,
      handNo: 0,
      winners: [],
      lastAction: null,
    };
  }

  findSeatByUser(userId: string): number {
    return this.seats.findIndex((s) => s.userId === userId);
  }

  get playerCount(): number {
    return this.seats.filter((s) => s.userId).length;
  }

  addPlayer(user: RoomUser, tableChips: number): { ok: true; seat: number } | { ok: false; error: string } {
    if (this.status === 'playing') return { ok: false, error: '牌局进行中，无法加入' };
    if (this.findSeatByUser(user.id) !== -1) return { ok: false, error: '你已在本房间' };
    let emptyIdx = this.seats.findIndex((s) => s.userId === null);
    if (emptyIdx === -1) {
      if (this.flexible && this.seats.length < this.maxSeats) {
        emptyIdx = this.seats.length;
        this.seats.push(this.emptySeat(emptyIdx));
      } else {
        return { ok: false, error: '房间已满' };
      }
    }
    const s = this.seats[emptyIdx];
    s.userId = user.id;
    s.username = user.username;
    s.chips = tableChips;
    s.buyInTotal = tableChips;
    s.connected = true;
    s.sittingOut = false;
    return { ok: true, seat: emptyIdx };
  }

  removePlayer(userId: string): { ok: boolean; refund?: number; stats?: PlayerStats; error?: string } {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { ok: false };
    if (this.status === 'playing') {
      return { ok: false, error: '牌局进行中，请等待本局结束' };
    }
    const s = this.seats[idx];
    const refund = s.chips;
    const stats: PlayerStats = {
      userId,
      username: s.username,
      buyInTotal: s.buyInTotal,
      finalChips: s.chips,
      netProfit: s.chips - s.buyInTotal,
      vpip: s.handsPlayed > 0 ? s.vpipHands / s.handsPlayed : 0,
      handsPlayed: s.handsPlayed,
      handsWon: s.handsWon,
    };
    this.seats[idx] = this.emptySeat(idx);
    return { ok: true, refund, stats };
  }

  markConnected(userId: string, connected: boolean): void {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return;
    this.seats[idx].connected = connected;
    if (connected) {
      this.seats[idx].sittingOut = false;
      this.clearDisconnectTimer(userId);
      this.kickAfterHand.delete(userId);
      return;
    }
    this.startDisconnectTimer(userId);
    if (this.handState.activeSeat === idx && this.status === 'playing') {
      this.clearTimer();
      this.advance();
    }
  }

  private startDisconnectTimer(userId: string): void {
    this.clearDisconnectTimer(userId);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(userId);
      if (this.status === 'playing') {
        this.kickAfterHand.add(userId);
      } else {
        this.kickPlayer(userId);
      }
    }, config.disconnectKickMs);
    this.disconnectTimers.set(userId, timer);
  }

  private clearDisconnectTimer(userId: string): void {
    const timer = this.disconnectTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(userId);
    }
  }

  private kickPlayer(userId: string): void {
    const res = this.removePlayer(userId);
    if (res.ok && res.stats) {
      this.onAutoKick?.(userId, res.refund ?? 0, res.stats);
    }
    this.broadcastState();
  }

  rebuy(userId: string, amount: number): { ok: boolean; error?: string } {
    if (this.status !== 'waiting') return { ok: false, error: '牌局进行中，无法买入' };
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { ok: false, error: '你不在房间' };
    this.seats[idx].chips += amount;
    this.seats[idx].buyInTotal += amount;
    return { ok: true };
  }

  startGame(): { ok: boolean; error?: string } {
    if (this.status === 'playing') return { ok: false, error: '牌局已进行' };
    const players = this.seats.filter((s) => s.userId && !s.sittingOut && s.chips > 0);
    if (players.length < 2) return { ok: false, error: '至少需要 2 名有筹码的玩家' };
    this.status = 'playing';
    const { firstActor } = startHand(this.seats, this.handState, this.smallBlind, this.bigBlind);
    if (firstActor === null) {
      this.status = 'waiting';
      return { ok: false, error: '无法开局' };
    }
    this.handState.activeSeat = firstActor;
    this.broadcastState();
    this.startTimer();
    console.log(`[room ${this.id}] 牌局开始，${players.length} 名玩家，庄家 seat${this.handState.dealer}`);
    return { ok: true };
  }

  handleAction(userId: string, action: ActionType, amount?: number): void {
    if (this.status !== 'playing') return;
    const seat = this.findSeatByUser(userId);
    if (seat === -1 || this.handState.activeSeat !== seat) return;
    const legal = computeLegalActions(this.seats, this.handState, seat);
    if (!this.isLegal(action, amount, legal)) return;
    this.clearTimer();
    applyAction(this.seats, this.handState, seat, action, amount);
    this.advance();
  }

  private isLegal(action: ActionType, amount: number | undefined, legal: LegalActions): boolean {
    switch (action) {
      case 'fold': return legal.canFold;
      case 'check': return legal.canCheck;
      case 'call': return legal.canCall;
      case 'raise':
        return legal.canRaise && typeof amount === 'number' && amount >= legal.minRaiseTo && amount <= legal.maxRaiseTo;
      case 'allin': return legal.maxRaiseTo > this.handState.currentBet;
      default: return false;
    }
  }

  private advance(): void {
    if (this.status !== 'playing') return;
    if (activeSeats(this.seats).length <= 1) {
      endHand(this.seats, this.handState);
      this.finishHand();
      return;
    }
    if (roundDone(this.seats, this.handState.currentBet)) {
      this.advanceStreetOrEnd();
      return;
    }
    const next = nextActor(this.seats, this.handState.activeSeat);
    if (!next) {
      this.advanceStreetOrEnd();
      return;
    }
    this.handState.activeSeat = next.seat;
    if (!next.connected || next.sittingOut) {
      this.autoPlay(next.seat);
      return;
    }
    this.startTimer();
    this.broadcastState();
  }

  private advanceStreetOrEnd(): void {
    const act = activeSeats(this.seats);
    if (act.length <= 1) {
      endHand(this.seats, this.handState);
      this.finishHand();
      return;
    }
    const { firstActor, ended } = advanceStreet(this.seats, this.handState, this.bigBlind);
    if (ended) {
      endHand(this.seats, this.handState);
      this.finishHand();
      return;
    }
    if (firstActor === -1) {
      this.advanceStreetOrEnd();
      return;
    }
    this.handState.activeSeat = firstActor;
    const p = this.seats[firstActor];
    if (!p.connected || p.sittingOut) {
      this.autoPlay(firstActor);
      return;
    }
    this.startTimer();
    this.broadcastState();
  }

  private autoPlay(seat: number): void {
    const legal = computeLegalActions(this.seats, this.handState, seat);
    const action: ActionType = legal.canCheck ? 'check' : 'fold';
    applyAction(this.seats, this.handState, seat, action);
    this.broadcastState();
    setTimeout(() => this.advance(), 400);
  }

  private finishHand(): void {
    this.clearTimer();
    this.handState.activeSeat = -1;
    this.status = 'waiting';
    for (const s of this.seats) {
      if (s.userId && !s.connected) s.sittingOut = true;
    }
    for (const userId of [...this.kickAfterHand]) {
      this.kickAfterHand.delete(userId);
      this.kickPlayer(userId);
    }
    const summary = this.handState.winners.map((w) => `seat${w.seat}+${w.amount}`).join(', ');
    console.log(`[room ${this.id}] 牌局结束，赢家: ${summary}`);
    this.broadcastState();
  }

  private startTimer(): void {
    this.clearTimer();
    const seat = this.handState.activeSeat;
    this.timer = setTimeout(() => {
      const p = this.seats[seat];
      if (!p || this.status !== 'playing' || this.handState.activeSeat !== seat) return;
      const legal = computeLegalActions(this.seats, this.handState, seat);
      const action: ActionType = legal.canCheck ? 'check' : 'fold';
      applyAction(this.seats, this.handState, seat, action);
      this.advance();
    }, this.actionTimeoutMs);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  snapshotFor(userId: string): GameSnapshot {
    const yourSeat = this.findSeatByUser(userId);
    const isShowdown = this.handState.stage === 'showdown';
    const seats: PublicSeatView[] = this.seats.map((s) => {
      const view: PublicSeatView = {
        seat: s.seat,
        username: s.username,
        chips: s.chips,
        folded: s.folded,
        allIn: s.allIn,
        betThisRound: s.betThisRound,
        sittingOut: s.sittingOut,
        connected: s.connected,
        isHost: s.userId === this.hostId,
        lastAction: s.lastAction,
        cardCount: s.cards.length,
        isWinner: this.handState.winners.some((w) => w.seat === s.seat),
      };
      if (s.userId && (s.seat === yourSeat || (isShowdown && !s.folded))) {
        view.cards = s.cards;
        view.bestHand = s.bestHand ?? undefined;
      }
      return view;
    });

    const legalActions =
      yourSeat >= 0 && this.status === 'playing' && this.handState.activeSeat === yourSeat
        ? computeLegalActions(this.seats, this.handState, yourSeat)
        : null;

    return {
      roomId: this.id,
      inviteCode: this.inviteCode,
      status: this.status,
      stage: this.handState.stage,
      seats,
      community: this.handState.community,
      pot: totalPot(this.seats),
      currentBet: this.handState.currentBet,
      minRaise: this.handState.minRaise,
      dealer: this.handState.dealer,
      activeSeat: this.handState.activeSeat,
      handNo: this.handState.handNo,
      winners: this.handState.winners,
      lastAction: this.handState.lastAction,
      legalActions,
      yourSeat,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      maxSeats: this.maxSeats,
    };
  }

  broadcastState(): void {
    for (const s of this.seats) {
      if (s.userId) this.emitTo(s.userId, 'game:snapshot', this.snapshotFor(s.userId));
    }
  }
}

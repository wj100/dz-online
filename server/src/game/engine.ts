import { bestFive, compareEval, shuffle, createDeck, type Card, type EvalResult } from './cards.js';
import type { ActionType, HandState, SeatState, WinnerInfo } from './types.js';

// 纯状态转换函数，操作 seats 数组与 handState（原地修改），无 IO。

export function activeSeats(seats: SeatState[]): SeatState[] {
  return seats.filter((s) => s.userId && !s.folded);
}

export function totalPot(seats: SeatState[]): number {
  return seats.reduce((sum, p) => sum + (p.contributed || 0), 0);
}

export function nextActor(seats: SeatState[], from: number): SeatState | null {
  const n = seats.length;
  for (let i = 1; i <= n; i++) {
    const seat = (from + i) % n;
    const p = seats[seat];
    if (p && p.userId && !p.folded && !p.allIn && p.chips > 0) return p;
  }
  return null;
}

export function nextSeatWithChips(seats: SeatState[], from: number): number {
  const n = seats.length;
  for (let i = 1; i <= n; i++) {
    const seat = (from + i) % n;
    const p = seats[seat];
    if (p && p.userId && p.chips > 0 && !p.sittingOut) return seat;
  }
  return -1;
}

export function roundDone(seats: SeatState[], currentBet: number): boolean {
  const act = activeSeats(seats);
  if (act.length <= 1) return true;
  return act.every((p) => p.allIn || (p.acted && p.betThisRound === currentBet));
}

export function postBlind(seats: SeatState[], seat: number, amount: number): void {
  const p = seats[seat];
  const pay = Math.min(amount, p.chips);
  p.chips -= pay;
  p.betThisRound += pay;
  p.contributed += pay;
  if (p.chips === 0) p.allIn = true;
}

// 开始新一局：重置、发牌、下盲注，返回第一个行动者座位（或 null 表示无法开局）
export function startHand(
  seats: SeatState[],
  handState: HandState,
  smallBlind: number,
  bigBlind: number,
): { firstActor: number | null } {
  handState.handNo++;
  for (const p of seats) {
    if (!p.userId) continue;
    p.cards = [];
    p.folded = p.sittingOut;
    p.allIn = false;
    p.acted = false;
    p.betThisRound = 0;
    p.contributed = 0;
    p.bestHand = null;
    p.lastAction = '';
    p.currentHandVpip = false;
    if (p.chips <= 0) p.folded = true; // 无筹码无法入局
  }
  handState.community = [];
  handState.currentBet = 0;
  handState.minRaise = bigBlind;
  handState.stage = 'preflop';
  handState.deck = shuffle(createDeck());
  handState.winners = [];
  handState.lastAction = null;

  const alive = seats.filter((s) => s.userId && s.chips > 0 && !s.sittingOut).map((s) => s.seat);
  if (alive.length < 2) return { firstActor: null };

  handState.dealer = nextSeatWithChips(seats, handState.dealer);
  const n = seats.length;
  for (let r = 0; r < 2; r++) {
    for (let i = 1; i <= n; i++) {
      const seat = (handState.dealer + i) % n;
      const p = seats[seat];
      if (p && p.userId && p.chips > 0 && !p.sittingOut) p.cards.push(handState.deck.pop() as Card);
    }
  }
  for (const p of seats) {
    if (p.userId && p.cards.length === 2) p.handsPlayed++;
  }

  let sb: number;
  let bb: number;
  if (alive.length === 2) {
    sb = handState.dealer; // heads-up：庄家兼小盲
    bb = nextSeatWithChips(seats, handState.dealer);
  } else {
    sb = nextSeatWithChips(seats, handState.dealer);
    bb = nextSeatWithChips(seats, sb);
  }
  postBlind(seats, sb, smallBlind);
  postBlind(seats, bb, bigBlind);
  handState.currentBet = bigBlind;
  handState.stage = 'preflop';

  const first = nextActor(seats, bb);
  return { firstActor: first ? first.seat : null };
}

// 执行一个玩家动作（合法性已由调用方用 legalActions 校验）
export function applyAction(
  seats: SeatState[],
  handState: HandState,
  seatIdx: number,
  action: ActionType,
  amount?: number,
): void {
  const p = seats[seatIdx];
  if (handState.stage === 'preflop' && (action === 'call' || action === 'raise' || action === 'allin')) {
    p.currentHandVpip = true;
  }
  switch (action) {
    case 'fold':
      p.folded = true;
      p.acted = true;
      p.lastAction = 'fold';
      break;
    case 'check':
      p.acted = true;
      p.lastAction = 'check';
      break;
    case 'call': {
      const cost = Math.min(handState.currentBet - p.betThisRound, p.chips);
      p.chips -= cost;
      p.betThisRound += cost;
      p.contributed += cost;
      if (p.chips === 0) p.allIn = true;
      p.acted = true;
      p.lastAction = 'call';
      break;
    }
    case 'raise': {
      const target = Math.min(amount as number, p.betThisRound + p.chips);
      const pay = target - p.betThisRound;
      const raiseDelta = target - handState.currentBet;
      p.chips -= pay;
      p.betThisRound = target;
      p.contributed += pay;
      handState.minRaise = Math.max(handState.minRaise, raiseDelta); // 修正最小加注
      handState.currentBet = target;
      for (const q of seats) {
        if (q.userId && !q.folded && !q.allIn && q.seat !== seatIdx) q.acted = false;
      }
      if (p.chips === 0) p.allIn = true;
      p.acted = true;
      p.lastAction = 'raise';
      break;
    }
    case 'allin': {
      const pay = p.chips;
      p.chips -= pay;
      p.betThisRound += pay;
      p.contributed += pay;
      if (p.betThisRound > handState.currentBet) {
        const raiseDelta = p.betThisRound - handState.currentBet;
        const isFullRaise = raiseDelta >= handState.minRaise;
        handState.currentBet = p.betThisRound;
        if (isFullRaise) {
          handState.minRaise = raiseDelta;
          // 完整加注才重新开启下注轮
          for (const q of seats) {
            if (q.userId && !q.folded && !q.allIn && q.seat !== seatIdx) q.acted = false;
          }
        }
      }
      p.allIn = true;
      p.acted = true;
      p.lastAction = 'allin';
      break;
    }
  }
  handState.lastAction = { seat: seatIdx, action, amount };
}

// 推进到下一街。返回 { firstActor, ended }：ended=true 表示已摊牌结束
export function advanceStreet(
  seats: SeatState[],
  handState: HandState,
  bigBlind: number,
): { firstActor: number; ended: boolean } {
  for (const p of seats) {
    if (p.userId) {
      p.betThisRound = 0;
      p.acted = false;
    }
  }
  handState.currentBet = 0;
  handState.minRaise = bigBlind;

  const act = activeSeats(seats);
  if (act.length <= 1) return { firstActor: -1, ended: true };

  if (handState.stage === 'preflop') {
    handState.deck.pop();
    handState.community.push(handState.deck.pop() as Card, handState.deck.pop() as Card, handState.deck.pop() as Card);
    handState.stage = 'flop';
  } else if (handState.stage === 'flop') {
    handState.deck.pop();
    handState.community.push(handState.deck.pop() as Card);
    handState.stage = 'turn';
  } else if (handState.stage === 'turn') {
    handState.deck.pop();
    handState.community.push(handState.deck.pop() as Card);
    handState.stage = 'river';
  } else if (handState.stage === 'river') {
    return { firstActor: -1, ended: true };
  }

  const first = nextActor(seats, handState.dealer);
  return { firstActor: first ? first.seat : -1, ended: false };
}

export interface SidePot {
  amount: number;
  eligible: number[];
}

export function buildSidePots(seats: SeatState[]): SidePot[] {
  const contributors = seats.filter((s) => s.userId && s.contributed > 0);
  const levels = [...new Set(contributors.map((s) => s.contributed))].sort((a, b) => a - b);
  const pots: SidePot[] = [];
  let prev = 0;
  for (const level of levels) {
    const atLevel = contributors.filter((s) => s.contributed >= level);
    const eligible = atLevel.filter((s) => !s.folded).map((s) => s.seat);
    const amount = (level - prev) * atLevel.length;
    pots.push({ amount, eligible });
    prev = level;
  }
  return pots;
}

// 结算：单人胜或摊牌分池，写回 handState.winners
export function endHand(seats: SeatState[], handState: HandState): void {
  for (const p of seats) {
    if (p.userId && p.cards.length > 0 && p.currentHandVpip) p.vpipHands++;
  }
  const act = activeSeats(seats);
  if (act.length === 1) {
    const w = act[0];
    const total = totalPot(seats);
    w.chips += total;
    w.handsWon++;
    handState.winners = [{ seat: w.seat, amount: total }];
    handState.stage = 'showdown';
    return;
  }

  handState.stage = 'showdown';
  const showdown: SeatState[] = [];
  for (const p of act) {
    p.bestHand = bestFive([...p.cards, ...handState.community]);
    showdown.push(p);
  }

  const pots = buildSidePots(seats);
  const result: WinnerInfo[] = [];
  for (const pot of pots) {
    const contenders = showdown.filter((p) => pot.eligible.includes(p.seat));
    let best: EvalResult | null = null;
    let winners: SeatState[] = [];
    for (const p of contenders) {
      const e = p.bestHand as EvalResult;
      if (!best || compareEval(e, best) > 0) {
        best = e;
        winners = [p];
      } else if (compareEval(e, best) === 0) {
        winners.push(p);
      }
    }
    if (winners.length === 0) continue;
    const share = Math.floor(pot.amount / winners.length);
    let rem = pot.amount - share * winners.length;
    for (const w of winners) {
      const extra = rem > 0 ? 1 : 0;
      rem -= extra;
      w.chips += share + extra;
      const existing = result.find((r) => r.seat === w.seat);
      if (existing) existing.amount += share + extra;
      else result.push({ seat: w.seat, amount: share + extra, hand: w.bestHand as EvalResult });
    }
  }
  for (const r of result) {
    seats[r.seat].handsWon++;
  }
  handState.winners = result;
}

// 计算某座位的合法动作
export function computeLegalActions(seats: SeatState[], handState: HandState, seatIdx: number) {
  const p = seats[seatIdx];
  const callAmount = Math.max(0, handState.currentBet - p.betThisRound);
  const canCheck = callAmount === 0;
  const maxRaiseTo = p.betThisRound + p.chips;
  const minRaiseTo = handState.currentBet + handState.minRaise;

  return {
    canFold: true,
    canCheck,
    canCall: callAmount > 0 && p.chips > 0,
    callAmount,
    canRaise: p.chips > callAmount && maxRaiseTo > handState.currentBet,
    minRaiseTo: Math.min(minRaiseTo, maxRaiseTo),
    maxRaiseTo,
  };
}

// 牌与牌型判定（从 texas-holdem.html 迁移，TypeScript 化，逻辑已验证）
export type Suit = '♠' | '♥' | '♦' | '♣';

export interface Card {
  r: number; // 2~14，11=J 12=Q 13=K 14=A
  s: Suit;
}

export interface EvalResult {
  category: number; // 8同花顺 7四条 6葫芦 5同花 4顺子 3三条 2两对 1一对 0高牌
  ranks: number[]; // 从高到低的 tiebreak 数组
}

export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANK_STR: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function rankStr(r: number): string {
  return RANK_STR[r] ?? String(r);
}

export function isRed(s: Suit): boolean {
  return s === '♥' || s === '♦';
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push({ r, s });
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function evaluate5(cards: Card[]): EvalResult {
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const suits = cards.map((c) => c.s);
  const isFlush = suits.every((s) => s === suits[0]);

  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh: number | null = null;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5; // A-2-3-4-5 轮子
  }

  const cnt: Record<number, number> = {};
  for (const r of ranks) cnt[r] = (cnt[r] || 0) + 1;
  const groups = Object.entries(cnt)
    .map(([r, c]) => ({ r: +r, c }))
    .sort((a, b) => b.c - a.c || b.r - a.r);

  if (isFlush && straightHigh !== null) return { category: 8, ranks: [straightHigh] };
  if (groups[0].c === 4) return { category: 7, ranks: [groups[0].r, groups[1].r] };
  if (groups[0].c === 3 && groups[1].c === 2) return { category: 6, ranks: [groups[0].r, groups[1].r] };
  if (isFlush) return { category: 5, ranks };
  if (straightHigh !== null) return { category: 4, ranks: [straightHigh] };
  if (groups[0].c === 3) {
    const ks = groups.filter((g) => g.c === 1).map((g) => g.r).sort((a, b) => b - a);
    return { category: 3, ranks: [groups[0].r, ...ks] };
  }
  if (groups[0].c === 2 && groups[1].c === 2) {
    const k = groups.find((g) => g.c === 1);
    return { category: 2, ranks: [groups[0].r, groups[1].r, k ? k.r : 0] };
  }
  if (groups[0].c === 2) {
    const ks = groups.filter((g) => g.c === 1).map((g) => g.r).sort((a, b) => b - a);
    return { category: 1, ranks: [groups[0].r, ...ks] };
  }
  return { category: 0, ranks };
}

export function bestFive(cards: Card[]): EvalResult {
  let best: EvalResult | null = null;
  const n = cards.length;
  const idx = [0, 1, 2, 3, 4];
  while (true) {
    const hand = idx.map((i) => cards[i]);
    const e = evaluate5(hand);
    if (!best || compareEval(e, best) > 0) best = e;
    let k = 4;
    while (k >= 0 && idx[k] === n - 5 + k) k--;
    if (k < 0) break;
    idx[k]++;
    for (let j = k + 1; j < 5; j++) idx[j] = idx[j - 1] + 1;
  }
  return best as EvalResult;
}

export function compareEval(a: EvalResult, b: EvalResult): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.ranks.length, b.ranks.length);
  for (let i = 0; i < len; i++) {
    const x = a.ranks[i] || 0;
    const y = b.ranks[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export function handName(category: number, ranks: number[]): string {
  const top = rankStr(ranks[0]);
  switch (category) {
    case 0: return '高牌 ' + top;
    case 1: return '一对 ' + top;
    case 2: return '两对 ' + top + ' 和 ' + rankStr(ranks[1]);
    case 3: return '三条 ' + top;
    case 4: return '顺子 ' + top + ' 高';
    case 5: return '同花 ' + top + ' 高';
    case 6: return '葫芦 ' + top + ' 带 ' + rankStr(ranks[1]);
    case 7: return '四条 ' + top;
    case 8: return top === 'A' ? '皇家同花顺' : '同花顺 ' + top + ' 高';
  }
  return '';
}

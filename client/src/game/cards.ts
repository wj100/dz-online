import type { Card, EvalResult } from '../types';

const RANK_STR: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function rankStr(r: number): string {
  return RANK_STR[r] ?? String(r);
}

export function isRed(s: string): boolean {
  return s === '♥' || s === '♦';
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

export function evalName(e?: EvalResult): string {
  return e ? handName(e.category, e.ranks) : '';
}

export function cardKey(c: Card): string {
  return `${c.r}-${c.s}`;
}

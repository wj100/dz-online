<template>
  <div class="table-page">
    <div class="topbar">
      <span class="brand">TEXAS HOLD'EM</span>
      <span class="stage-badge">{{ stageName }}</span>
      <div class="top-actions">
        <span class="invite">邀请码 {{ snap?.inviteCode }}</span>
        <n-button size="tiny" @click="copyInvite">复制</n-button>
        <n-button size="tiny" quaternary :disabled="snap?.status === 'playing'" @click="doLeave">
          离开
        </n-button>
      </div>
    </div>

    <div class="table-wrap">
      <div class="table"></div>

      <div class="community">
        <template v-for="i in 5" :key="i">
          <PokerCard v-if="snap && i <= snap.community.length" :card="snap.community[i - 1]" />
          <div v-else class="card-slot"></div>
        </template>
      </div>

      <div class="pot-label">
        <div class="pot-amount">底池 {{ snap?.pot ?? 0 }}</div>
      </div>

      <div
        v-for="s in snap?.seats ?? []"
        :key="s.seat"
        class="seat"
        :class="seatClasses(s)"
        :style="seatStyle(s)"
      >
        <span v-if="showMarks && s.seat === snap!.dealer" class="dealer-tag">BTN</span>
        <span v-if="showMarks && s.seat === blinds.sb" class="blind-tag sb">SB</span>
        <span v-if="showMarks && s.seat === blinds.bb" class="blind-tag bb">BB</span>
        <div class="badge">
          <div class="avatar">{{ avatarOf(s) }}</div>
          <div class="name">{{ s.username || '空位' }}</div>
          <div class="chips" v-if="s.username">{{ s.chips }}</div>
        </div>
        <div v-if="s.cardCount > 0" class="hand">
          <template v-if="s.cards && s.cards.length">
            <PokerCard v-for="c in s.cards" :key="`${c.r}-${c.s}`" :card="c" size="small" />
          </template>
          <template v-else>
            <PokerCard v-for="i in s.cardCount" :key="i" :card="null" face-down size="small" />
          </template>
        </div>
        <div v-if="s.betThisRound > 0" class="bet-pill">下注 {{ s.betThisRound }}</div>
        <div v-if="s.lastAction" class="action-msg">{{ actionLabel(s.lastAction) }}</div>
      </div>
    </div>

    <div class="controls">
      <template v-if="snap && snap.status === 'waiting' && snap.stage !== 'showdown'">
        <n-button v-if="amHost" type="primary" size="large" :disabled="!canStart" @click="doStart">
          开始游戏
        </n-button>
        <span v-else class="hint">等待房主开始…（{{ readyCount }}/2 人已就绪）</span>
        <n-button v-if="canRebuy" type="warning" @click="doRebuy">重新买入 1000</n-button>
      </template>

      <template v-else-if="snap?.legalActions">
        <div v-if="snap.legalActions.canRaise" class="raise-row">
          <span class="raise-amount">加到 {{ raiseAmount }}</span>
          <input
            v-model.number="raiseAmount"
            type="range"
            :min="snap.legalActions.minRaiseTo"
            :max="snap.legalActions.maxRaiseTo"
          />
        </div>
        <div class="action-row">
          <button class="btn btn-fold" @click="doAct('fold')">弃牌</button>
          <button class="btn btn-check" :disabled="!snap.legalActions.canCheck" @click="doAct('check')">过牌</button>
          <button class="btn btn-call" :disabled="!snap.legalActions.canCall" @click="doAct('call')">
            跟注 {{ snap.legalActions.callAmount }}
          </button>
          <button class="btn btn-raise" :disabled="!snap.legalActions.canRaise" @click="doAct('raise')">加注</button>
          <button class="btn btn-allin" @click="doAct('allin')">全下 {{ snap.legalActions.maxRaiseTo }}</button>
        </div>
      </template>

      <span v-else class="hint">{{ stageHint }}</span>
    </div>

    <div v-if="showResult" class="overlay">
      <div class="result-box">
        <div class="result-title">{{ resultTitle }}</div>
        <div class="result-detail">
          <div v-for="(line, i) in resultLines" :key="i">{{ line }}</div>
        </div>
        <div class="result-btns">
          <n-button v-if="canRebuy" type="warning" @click="doRebuy">重新买入 1000</n-button>
          <n-button v-if="amHost" type="primary" @click="doStart">开始下一局</n-button>
          <n-button @click="doLeave">离开房间</n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, useMessage } from 'naive-ui';
import PokerCard from '../components/PokerCard.vue';
import { useGameStore } from '../stores/game';
import { useAuthStore } from '../stores/auth';
import type { ActionType, PublicSeatView } from '../types';
import { evalName } from '../game/cards';

const router = useRouter();
const message = useMessage();
const game = useGameStore();
const auth = useAuthStore();

const raiseAmount = ref(0);

const snap = computed(() => game.snapshot);

const STAGE_NAMES: Record<string, string> = {
  waiting: '等待中',
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
};

const stageName = computed(() => (snap.value ? STAGE_NAMES[snap.value.stage] ?? snap.value.stage : '连接中…'));

const showMarks = computed(() => {
  const s = snap.value?.stage;
  return s && s !== 'waiting' && s !== 'showdown';
});

const blinds = computed(() => {
  const g = snap.value;
  if (!g) return { sb: -1, bb: -1 };
  const n = g.seats.length;
  const inHand = g.seats.filter((s) => s.cardCount > 0).map((s) => s.seat);
  const next = (from: number) => {
    for (let i = 1; i <= n; i++) {
      const seat = (from + i) % n;
      if (inHand.includes(seat)) return seat;
    }
    return -1;
  };
  if (inHand.length === 2) return { sb: g.dealer, bb: next(g.dealer) };
  const sb = next(g.dealer);
  return { sb, bb: next(sb) };
});

const amHost = computed(() => {
  const g = snap.value;
  if (!g) return false;
  const me = g.seats.find((s) => s.seat === g.yourSeat);
  return !!me?.isHost;
});

const readyCount = computed(() => (snap.value ? snap.value.seats.filter((s) => s.username && s.chips > 0).length : 0));

const canStart = computed(() => {
  const g = snap.value;
  if (!g) return false;
  return g.seats.filter((s) => s.username && !s.sittingOut && s.chips > 0).length >= 2;
});

const canRebuy = computed(() => {
  const g = snap.value;
  if (!g) return false;
  const me = g.seats.find((s) => s.seat === g.yourSeat);
  return !!me && me.chips < 100;
});

const stageHint = computed(() => {
  const g = snap.value;
  if (!g) return '连接中…';
  if (g.status === 'playing') return '等待对手行动…';
  return '';
});

const showResult = computed(() => snap.value?.stage === 'showdown');

const resultTitle = computed(() => {
  const g = snap.value;
  if (!g) return '';
  if (g.winners.length === 0) return '对局结束';
  if (g.winners.length === 1) {
    const w = g.winners[0];
    return w.seat === g.yourSeat ? '🎉 你赢了！' : `${seatName(w.seat)} 获胜`;
  }
  return '平局分池';
});

const resultLines = computed(() => {
  const g = snap.value;
  if (!g) return [];
  if (g.winners.length === 1) {
    const w = g.winners[0];
    const lines = [`赢得 ${w.amount} 筹码`];
    if (w.hand) lines.push(`牌型：${evalName(w.hand)}`);
    return lines;
  }
  return g.winners.map((w) => `${seatName(w.seat)} +${w.amount}`);
});

function seatName(seat: number): string {
  return snap.value?.seats.find((s) => s.seat === seat)?.username || `座位${seat}`;
}

function seatClasses(s: PublicSeatView): string[] {
  const cls: string[] = [];
  if (snap.value && s.seat === snap.value.activeSeat) cls.push('active');
  if (s.folded) cls.push('folded');
  if (s.isWinner) cls.push('winner');
  if (!s.username) cls.push('empty');
  return cls;
}

function seatStyle(s: PublicSeatView): Record<string, string> {
  const g = snap.value;
  const total = g?.seats.length ?? 6;
  const rel = (s.seat - (g?.yourSeat ?? 0) + total) % total;
  const angle = Math.PI / 2 + (rel / total) * 2 * Math.PI;
  const left = 50 + 44 * Math.cos(angle);
  const top = 50 + 40 * Math.sin(angle);
  return { left: `${left}%`, top: `${top}%` };
}

function avatarOf(s: PublicSeatView): string {
  return s.username ? s.username.charAt(0).toUpperCase() : '·';
}

const ACTION_LABELS: Record<string, string> = {
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  raise: '加注',
  allin: '全下',
};

function actionLabel(a: string): string {
  return ACTION_LABELS[a] ?? a;
}

watch(
  () => snap.value?.legalActions,
  (legal) => {
    if (legal?.canRaise) raiseAmount.value = legal.minRaiseTo;
  },
);

onMounted(() => {
  if (!game.connected) game.bindSocket(auth.token);
});

async function doStart(): Promise<void> {
  const res = await game.startGame();
  if (!res.ok) message.error(res.error || '无法开始');
}

async function doRebuy(): Promise<void> {
  const res = await game.rebuy();
  if (res.ok) message.success(`已买入 ${res.amount} 筹码`);
  else message.error(res.error || '买入失败');
}

async function doAct(action: ActionType): Promise<void> {
  const amount = action === 'raise' ? raiseAmount.value : undefined;
  await game.act(action, amount);
}

async function doLeave(): Promise<void> {
  const res = await game.leaveRoom();
  if (!res.ok) { message.error(res.error || '离开失败'); return; }
  message.success(`已离开房间${res.refund ? `，退还 ${res.refund} 筹码` : ''}`);
  router.push({ name: 'lobby' });
}

function copyInvite(): void {
  if (!snap.value) return;
  navigator.clipboard?.writeText(snap.value.inviteCode);
  message.success('邀请码已复制');
}
</script>

<style scoped>
.table-page {
  position: relative;
  width: 100%;
  height: 100vh;
  max-height: 820px;
  max-width: 1100px;
  margin: 0 auto;
  overflow: hidden;
  background: radial-gradient(1200px 700px at 50% 20%, #1a1512, #0c0a08 70%);
  user-select: none;
}
.topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  z-index: 20;
}
.brand {
  font-weight: 800;
  letter-spacing: 2px;
  color: #d4af37;
  font-size: 15px;
}
.stage-badge {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(212, 175, 55, 0.35);
  padding: 4px 14px;
  border-radius: 20px;
  color: #d4af37;
  font-weight: 600;
  letter-spacing: 1px;
  font-size: 13px;
}
.top-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.invite {
  font-size: 12px;
  color: #a89f8c;
}
.table-wrap {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(92vw, 920px);
  height: min(56vh, 480px);
}
.table {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(ellipse at 50% 42%, #1f6b43 0%, #175636 55%, #0e2f1d 100%);
  box-shadow:
    inset 0 0 60px rgba(0, 0, 0, 0.55),
    inset 0 0 0 18px #6b4a2b,
    inset 0 0 0 22px #5a3a20,
    inset 0 0 0 26px #3a2514,
    0 20px 60px rgba(0, 0, 0, 0.6);
}
.community {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  gap: 8px;
  z-index: 5;
}
.card-slot {
  width: 62px;
  height: 88px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px dashed rgba(255, 255, 255, 0.18);
}
.pot-label {
  position: absolute;
  top: calc(50% + 78px);
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  z-index: 6;
  pointer-events: none;
}
.pot-amount {
  font-size: 20px;
  font-weight: 700;
  color: #ffe9a8;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}
.seat {
  position: absolute;
  width: 120px;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 10;
}
.seat .badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 5px 12px;
  min-width: 88px;
  transition: all 0.2s;
}
.seat.active .badge {
  border-color: #d4af37;
  box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.35), 0 0 18px rgba(212, 175, 55, 0.4);
}
.seat.winner .badge {
  border-color: #ffe08a;
  box-shadow: 0 0 0 2px rgba(255, 224, 138, 0.5), 0 0 22px rgba(255, 224, 138, 0.6);
}
.seat.folded .badge,
.seat.empty .badge {
  opacity: 0.45;
}
.seat .avatar {
  font-size: 24px;
  line-height: 1;
  font-weight: 700;
}
.seat .name {
  font-size: 12px;
  font-weight: 600;
  color: #e9e4d6;
}
.seat .chips {
  font-size: 12px;
  color: #ffe08a;
  font-weight: 700;
}
.seat .dealer-tag,
.seat .blind-tag {
  position: absolute;
  top: -10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.5px;
  z-index: 3;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}
.seat .dealer-tag {
  background: #d4af37;
  color: #1a1408;
  right: -8px;
  left: auto;
}
.seat .blind-tag {
  background: #fff;
  color: #333;
  left: -8px;
  right: auto;
}
.seat .blind-tag.bb {
  background: #ffe08a;
  color: #5a3a10;
}
.seat .hand {
  display: flex;
  gap: 4px;
}
.seat .bet-pill {
  font-size: 11px;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.seat .action-msg {
  position: absolute;
  top: -32px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 700;
  color: #ffe08a;
  background: rgba(0, 0, 0, 0.6);
  padding: 3px 9px;
  border-radius: 10px;
  white-space: nowrap;
}
.controls {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 30;
  padding-bottom: 10px;
}
.raise-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.raise-row input[type='range'] {
  width: 200px;
  accent-color: #d4af37;
}
.raise-amount {
  font-size: 14px;
  font-weight: 700;
  color: #ffe08a;
  min-width: 70px;
  text-align: center;
}
.action-row {
  display: flex;
  gap: 10px;
}
.btn {
  padding: 11px 20px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  transition: transform 0.08s, box-shadow 0.15s, filter 0.15s;
  color: #fff;
}
.btn:active {
  transform: translateY(2px);
}
.btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  filter: grayscale(0.6);
}
.btn-fold {
  background: linear-gradient(180deg, #c44a44, #8f2f2a);
  box-shadow: 0 4px 0 #5f1f1b;
}
.btn-check {
  background: linear-gradient(180deg, #4a9e6a, #2f7a4c);
  box-shadow: 0 4px 0 #1f5232;
}
.btn-call {
  background: linear-gradient(180deg, #4a90d9, #2f6ab0);
  box-shadow: 0 4px 0 #1e4a80;
}
.btn-raise {
  background: linear-gradient(180deg, #d9a441, #b07f22);
  box-shadow: 0 4px 0 #7a5716;
}
.btn-allin {
  background: linear-gradient(180deg, #b54a8f, #8a2f6a);
  box-shadow: 0 4px 0 #5c1f46;
}
.hint {
  font-size: 13px;
  color: #a89f8c;
}
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(3px);
}
.result-box {
  background: linear-gradient(180deg, #241c14, #17110b);
  border: 1px solid #8a7420;
  border-radius: 18px;
  padding: 30px 40px;
  text-align: center;
  max-width: 420px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
}
.result-title {
  font-size: 26px;
  font-weight: 800;
  color: #ffe08a;
  margin-bottom: 6px;
}
.result-detail {
  font-size: 14px;
  color: #a89f8c;
  margin-bottom: 20px;
  line-height: 1.6;
}
.result-btns {
  display: flex;
  gap: 12px;
  justify-content: center;
}
@media (max-width: 700px) {
  .card-slot,
  .community :deep(.card) {
    width: 44px;
    height: 62px;
  }
  .seat {
    width: 88px;
  }
  .seat .hand :deep(.card) {
    width: 34px;
    height: 48px;
  }
  .community {
    gap: 4px;
  }
}

@media (orientation: landscape) and (max-height: 500px) {
  .topbar {
    padding: 6px 12px;
  }
  .brand {
    font-size: 13px;
  }
  .stage-badge {
    font-size: 11px;
    padding: 3px 10px;
  }
  .table-wrap {
    width: min(120vh, 600px);
    height: min(78vh, 430px);
  }
  .card-slot,
  .community :deep(.card) {
    width: 40px;
    height: 56px;
  }
  .community {
    gap: 5px;
  }
  .pot-label {
    top: calc(50% + 50px);
  }
  .pot-amount {
    font-size: 15px;
  }
  .seat {
    width: 80px;
    gap: 2px;
  }
  .seat .badge {
    padding: 3px 8px;
    min-width: 64px;
    border-radius: 8px;
  }
  .seat .avatar {
    font-size: 18px;
  }
  .seat .name,
  .seat .chips {
    font-size: 10px;
  }
  .seat .hand :deep(.card) {
    width: 30px;
    height: 42px;
  }
  .seat .dealer-tag,
  .seat .blind-tag {
    width: 18px;
    height: 18px;
    font-size: 8px;
    top: -8px;
  }
  .seat .action-msg {
    top: -24px;
    font-size: 10px;
  }
  .controls {
    padding-bottom: 4px;
    gap: 5px;
  }
  .raise-row input[type='range'] {
    width: 150px;
  }
  .raise-amount {
    font-size: 12px;
  }
  .action-row {
    gap: 6px;
  }
  .btn {
    padding: 7px 13px;
    font-size: 13px;
    border-radius: 8px;
  }
  .hint {
    font-size: 11px;
  }
}
</style>

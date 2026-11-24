<template>
  <div class="stats-wrap">
    <div class="topbar">
      <span class="brand">TEXAS HOLD'EM · 数据统计</span>
      <n-button size="small" quaternary @click="goBack">返回大厅</n-button>
    </div>

    <n-radio-group v-model:value="tab" class="tab-switch">
      <n-radio-button value="leaderboard">排行榜</n-radio-button>
      <n-radio-button value="history">历史对局</n-radio-button>
    </n-radio-group>

    <div v-if="tab === 'leaderboard'" class="lb-grid">
      <n-card title="积分排行（累计盈亏）" :bordered="false" class="lb-card">
        <table class="tbl">
          <thead>
            <tr><th>#</th><th>玩家</th><th>累计盈亏</th><th>总手数</th></tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in profitRank" :key="r.userId">
              <td>{{ i + 1 }}</td>
              <td>{{ r.username }}</td>
              <td :class="r.netProfit >= 0 ? 'pos' : 'neg'">{{ r.netProfit >= 0 ? '+' : '' }}{{ r.netProfit }}</td>
              <td>{{ r.handsPlayed }}</td>
            </tr>
            <tr v-if="profitRank.length === 0"><td colspan="4" class="empty">暂无数据</td></tr>
          </tbody>
        </table>
      </n-card>

      <n-card title="胜率排行" :bordered="false" class="lb-card">
        <table class="tbl">
          <thead>
            <tr><th>#</th><th>玩家</th><th>胜率</th><th>胜 / 总手</th></tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in winRateRank" :key="r.userId">
              <td>{{ i + 1 }}</td>
              <td>{{ r.username }}</td>
              <td>{{ (r.winRate * 100).toFixed(1) }}%</td>
              <td>{{ r.handsWon }} / {{ r.handsPlayed }}</td>
            </tr>
            <tr v-if="winRateRank.length === 0"><td colspan="4" class="empty">暂无数据</td></tr>
          </tbody>
        </table>
      </n-card>
    </div>

    <n-card v-else title="历史对局" :bordered="false" class="history-card">
      <table class="tbl">
        <thead>
          <tr><th>日期</th><th>玩家人数</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="s in sessions" :key="s.id">
            <td>{{ formatTime(s.startedAt) }}</td>
            <td>{{ s.playerCount }} 人</td>
            <td><n-button size="tiny" @click="openDetail(s.id)">查看详情</n-button></td>
          </tr>
          <tr v-if="sessions.length === 0"><td colspan="3" class="empty">暂无对局记录</td></tr>
        </tbody>
      </table>
    </n-card>

    <n-modal v-model:show="detailVisible" title="对局详情" preset="card" style="max-width: 760px">
      <table class="tbl">
        <thead>
          <tr><th>玩家</th><th>买入</th><th>最终筹码</th><th>盈亏</th><th>入池率</th><th>胜率</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in detailPlayers" :key="p.username">
            <td>{{ p.username }}</td>
            <td>{{ p.buyInTotal }}</td>
            <td>{{ p.finalChips }}</td>
            <td :class="p.netProfit >= 0 ? 'pos' : 'neg'">{{ p.netProfit >= 0 ? '+' : '' }}{{ p.netProfit }}</td>
            <td>{{ (p.vpip * 100).toFixed(0) }}%</td>
            <td>{{ p.handsPlayed > 0 ? ((p.handsWon / p.handsPlayed) * 100).toFixed(0) : 0 }}%</td>
          </tr>
        </tbody>
      </table>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NCard, NModal, NRadioButton, NRadioGroup } from 'naive-ui';
import {
  fetchLeaderboard,
  fetchSessionDetail,
  fetchSessions,
  type LeaderboardRow,
  type SessionPlayer,
  type SessionSummary,
} from '../api/http';

const router = useRouter();
const tab = ref<'leaderboard' | 'history'>('leaderboard');
const sessions = ref<SessionSummary[]>([]);
const leaderboard = ref<LeaderboardRow[]>([]);
const detailVisible = ref(false);
const detailPlayers = ref<SessionPlayer[]>([]);

const profitRank = computed(() => [...leaderboard.value].sort((a, b) => b.netProfit - a.netProfit));
const winRateRank = computed(() => [...leaderboard.value].sort((a, b) => b.winRate - a.winRate));

function formatTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function loadAll(): Promise<void> {
  const [s, lb] = await Promise.all([fetchSessions(), fetchLeaderboard()]);
  sessions.value = s;
  leaderboard.value = lb;
}

async function openDetail(id: string): Promise<void> {
  const d = await fetchSessionDetail(id);
  detailPlayers.value = d.players;
  detailVisible.value = true;
}

function goBack(): void {
  router.push({ name: 'lobby' });
}

onMounted(loadAll);
</script>

<style scoped>
.stats-wrap {
  min-height: 100vh;
  background: radial-gradient(1200px 700px at 50% 20%, #1a1512, #0c0a08 70%);
  padding: 20px;
}
.topbar {
  max-width: 960px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.brand {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #d4af37;
}
.tab-switch {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}
.lb-grid {
  max-width: 960px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.lb-card,
.history-card {
  border-radius: 16px;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.tbl th,
.tbl td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: #e9e4d6;
}
.tbl th {
  color: #a89f8c;
  font-weight: 600;
  font-size: 13px;
}
.pos {
  color: #2f8f5b;
  font-weight: 700;
}
.neg {
  color: #b5403a;
  font-weight: 700;
}
.empty {
  text-align: center;
  color: #a89f8c;
  padding: 24px;
}
@media (max-width: 700px) {
  .lb-grid {
    grid-template-columns: 1fr;
  }
}
</style>

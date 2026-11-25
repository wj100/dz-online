<template>
  <div class="lobby-wrap">
    <div class="topbar">
      <span class="brand">TEXAS HOLD'EM</span>
      <div class="user-box">
        <span class="uname">{{ auth.user?.username }}</span>
        <span class="chips">💰 银行余额 {{ auth.user?.chips ?? '-' }}</span>
        <n-button v-if="auth.user && auth.user.chips === 0" size="small" type="warning" @click="doReset">
          重置筹码
        </n-button>
        <n-button size="small" quaternary @click="goStats">数据统计</n-button>
        <n-button size="small" quaternary @click="doLogout">退出</n-button>
      </div>
    </div>

    <div class="panels">
      <n-card title="创建房间" class="panel" :bordered="false">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="座位数">
            <n-radio-group v-model:value="maxSeats">
              <n-radio-button :value="0">灵活</n-radio-button>
              <n-radio-button v-for="n in [4, 6, 9]" :key="n" :value="n">{{ n }} 人</n-radio-button>
            </n-radio-group>
          </n-form-item>
          <n-form-item label="盲注">
            <n-radio-group v-model:value="blind">
              <n-radio-button v-for="b in blindOptions" :key="b.value" :value="b.value">{{ b.label }}</n-radio-button>
            </n-radio-group>
          </n-form-item>
          <n-button type="primary" block size="large" :loading="creating" @click="doCreate">
            创建房间
          </n-button>
        </n-form>
      </n-card>

      <n-card title="加入房间" class="panel" :bordered="false">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="邀请码">
            <n-input v-model:value="inviteCode" placeholder="6 位邀请码" size="large" style="text-transform: uppercase" @keyup.enter="doJoin" />
          </n-form-item>
          <n-button type="info" block size="large" :loading="joining" @click="doJoin">
            加入房间
          </n-button>
        </n-form>
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NRadioButton,
  NRadioGroup,
  useMessage,
} from 'naive-ui';
import { useAuthStore } from '../stores/auth';
import { useGameStore } from '../stores/game';
import { resetChips } from '../api/http';

const router = useRouter();
const message = useMessage();
const auth = useAuthStore();
const game = useGameStore();

const blindOptions = [
  { value: '5-10', label: '5/10' },
  { value: '10-20', label: '10/20' },
  { value: '25-50', label: '25/50' },
];

const maxSeats = ref(0);
const blind = ref('5-10');
const inviteCode = ref('');
const creating = ref(false);
const joining = ref(false);

onMounted(async () => {
  if (!game.connected) game.bindSocket(auth.token);
  await auth.loadMe();
});

async function doCreate(): Promise<void> {
  creating.value = true;
  try {
    const [smallBlind, bigBlind] = blind.value.split('-').map(Number);
    const flexible = maxSeats.value === 0;
    const res = await game.createRoom({
      flexible,
      maxSeats: flexible ? undefined : maxSeats.value,
      smallBlind,
      bigBlind,
    });
    if (!res.ok) { message.error(res.error || '创建失败'); return; }
    message.success(`房间已创建，邀请码 ${res.inviteCode}`);
    router.push({ name: 'table' });
  } finally {
    creating.value = false;
  }
}

async function doJoin(): Promise<void> {
  const code = inviteCode.value.trim().toUpperCase();
  if (code.length < 6) { message.error('请输入 6 位邀请码'); return; }
  joining.value = true;
  try {
    const res = await game.joinRoom(code);
    if (!res.ok) { message.error(res.error || '加入失败'); return; }
    message.success('加入成功');
    router.push({ name: 'table' });
  } finally {
    joining.value = false;
  }
}

async function doReset(): Promise<void> {
  try {
    const user = await resetChips();
    auth.user = user;
    message.success('已重置 1000 筹码');
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } };
    message.error(err?.response?.data?.error || '重置失败');
  }
}

function doLogout(): void {
  game.unbind();
  auth.logout();
  router.push({ name: 'login' });
}

function goStats(): void {
  router.push({ name: 'stats' });
}
</script>

<style scoped>
.lobby-wrap {
  min-height: 100vh;
  background: radial-gradient(1200px 700px at 50% 20%, #1a1512, #0c0a08 70%);
  padding: 20px;
}
.topbar {
  max-width: 900px;
  margin: 0 auto 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.brand {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 3px;
  color: #d4af37;
}
.user-box {
  display: flex;
  align-items: center;
  gap: 14px;
}
.uname {
  color: #e9e4d6;
  font-weight: 600;
}
.chips {
  color: #ffe08a;
  font-size: 14px;
}
.panels {
  max-width: 900px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.panel {
  border-radius: 16px;
}
@media (max-width: 700px) {
  .panels {
    grid-template-columns: 1fr;
  }
}
</style>

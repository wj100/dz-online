<template>
  <div class="login-wrap">
    <div class="brand">TEXAS HOLD'EM</div>
    <div class="sub">德州扑克 · 多人在线现金局</div>
    <n-card class="login-card" :bordered="false">
      <n-radio-group v-model:value="mode" class="mode-switch">
        <n-radio-button value="login">登录</n-radio-button>
        <n-radio-button value="register">注册</n-radio-button>
      </n-radio-group>
      <n-form class="form" @submit.prevent>
        <n-form-item label="用户名">
          <n-input v-model:value="username" placeholder="2~16 位字符" />
        </n-form-item>
        <n-form-item label="密码">
          <n-input
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="至少 6 位"
            @keyup.enter="submit"
          />
        </n-form-item>
        <n-button type="primary" block size="large" :loading="loading" @click="submit">
          {{ mode === 'login' ? '登录' : '注册并领取 1000 筹码' }}
        </n-button>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NCard, NForm, NFormItem, NInput, NRadioButton, NRadioGroup, useMessage } from 'naive-ui';
import { useAuthStore } from '../stores/auth';
import { useGameStore } from '../stores/game';

const router = useRouter();
const message = useMessage();
const auth = useAuthStore();
const game = useGameStore();

const mode = ref<'login' | 'register'>('login');
const username = ref('');
const password = ref('');
const loading = ref(false);

async function submit(): Promise<void> {
  const name = username.value.trim();
  if (name.length < 2) { message.error('用户名至少 2 位'); return; }
  if (password.value.length < 6) { message.error('密码至少 6 位'); return; }
  loading.value = true;
  try {
    if (mode.value === 'login') {
      await auth.login(name, password.value);
      message.success('登录成功');
    } else {
      await auth.register(name, password.value);
      message.success('注册成功，已赠送 1000 筹码');
    }
    game.bindSocket(auth.token);
    router.push({ name: 'lobby' });
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } };
    message.error(err?.response?.data?.error || '操作失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: radial-gradient(1200px 700px at 50% 20%, #1a1512, #0c0a08 70%);
}
.brand {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 4px;
  color: #d4af37;
}
.sub {
  font-size: 13px;
  color: #a89f8c;
  margin-bottom: 20px;
}
.login-card {
  width: 360px;
  border-radius: 16px;
}
.form {
  margin-top: 16px;
}
.mode-switch {
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
}
</style>

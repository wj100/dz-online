<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <router-view />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { NConfigProvider, NMessageProvider, NDialogProvider } from 'naive-ui';
import { useAuthStore } from './stores/auth';
import { useGameStore } from './stores/game';

const auth = useAuthStore();
const game = useGameStore();

onMounted(() => {
  if (auth.token) {
    game.bindSocket(auth.token);
    auth.loadMe();
  }
});

const themeOverrides = {
  common: {
    primaryColor: '#d4af37',
    primaryColorHover: '#e0bf5a',
    primaryColorPressed: '#b8932a',
  },
};
</script>

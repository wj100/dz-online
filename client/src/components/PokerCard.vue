<template>
  <div class="card" :class="[faceDown ? 'face-down' : cardColor, size]">
    <template v-if="!faceDown && card">
      <div class="corner tl">{{ rankStr(card.r) }}<span class="s">{{ card.s }}</span></div>
      <div class="pip">{{ card.s }}</div>
      <div class="corner br">{{ rankStr(card.r) }}<span class="s">{{ card.s }}</span></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Card } from '../types';
import { isRed, rankStr } from '../game/cards';

const props = withDefaults(
  defineProps<{
    card: Card | null;
    faceDown?: boolean;
    size?: 'normal' | 'small';
  }>(),
  { faceDown: false, size: 'normal' },
);

const cardColor = computed(() => (props.card && isRed(props.card.s) ? 'red' : 'black'));
</script>

<style scoped>
.card {
  position: relative;
  width: 62px;
  height: 88px;
  border-radius: 8px;
  background: linear-gradient(160deg, #ffffff, #f7f5ef);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-weight: 800;
  overflow: hidden;
  flex-shrink: 0;
}
.card.small {
  width: 40px;
  height: 58px;
}
.card.small .corner {
  font-size: 10px;
}
.card.small .corner .s {
  font-size: 9px;
}
.card.small .pip {
  font-size: 22px;
}
.corner {
  position: absolute;
  font-size: 13px;
  line-height: 1;
  text-align: center;
  font-weight: 800;
}
.corner.tl {
  top: 4px;
  left: 5px;
}
.corner.br {
  bottom: 4px;
  right: 5px;
  transform: rotate(180deg);
}
.corner .s {
  display: block;
  font-size: 12px;
  margin-top: -1px;
}
.pip {
  font-size: 34px;
}
.red {
  color: #c2382a;
}
.black {
  color: #1c1c1c;
}
.face-down {
  background: linear-gradient(160deg, #2b4a8a, #1c3060);
  color: #cfe0ff;
}
.face-down::after {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: 5px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  background: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.08) 0 4px, transparent 4px 8px);
}
</style>

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ActionType, GameSnapshot } from '../types';
import { connectSocket, disconnectSocket, getSocket } from '../socket';

interface AckResult {
  ok: boolean;
  error?: string;
}

export const useGameStore = defineStore('game', () => {
  const snapshot = ref<GameSnapshot | null>(null);
  const connected = ref(false);

  function bindSocket(token: string): void {
    const socket = connectSocket(token);
    socket.on('connect', () => {
      connected.value = true;
    });
    socket.on('disconnect', () => {
      connected.value = false;
    });
    socket.on('game:snapshot', (snap: GameSnapshot) => {
      snapshot.value = snap;
    });
  }

  function unbind(): void {
    disconnectSocket();
    snapshot.value = null;
    connected.value = false;
  }

  function emit<T = AckResult>(event: string, payload?: unknown): Promise<T> {
    const socket = getSocket();
    return new Promise((resolve) => {
      if (!socket) return resolve({ ok: false, error: '未连接' } as T);
      socket.emit(event, payload ?? {}, (res: T) => resolve(res));
    });
  }

  function createRoom(opts?: { maxSeats?: number; smallBlind?: number; bigBlind?: number; flexible?: boolean }) {
    return emit<{ ok: boolean; roomId?: string; inviteCode?: string; error?: string }>(
      'room:create',
      opts ?? {},
    );
  }

  function joinRoom(code: string) {
    return emit<{ ok: boolean; roomId?: string; error?: string }>('room:join', code);
  }

  function leaveRoom() {
    return emit<{ ok: boolean; refund?: number; error?: string }>('room:leave', {});
  }

  function startGame() {
    return emit<{ ok: boolean; error?: string }>('room:start', {});
  }

  function act(action: ActionType, amount?: number) {
    return emit<{ ok: boolean; error?: string }>('game:act', { action, amount });
  }

  function rebuy() {
    return emit<{ ok: boolean; amount?: number; error?: string }>('game:rebuy', {});
  }

  return { snapshot, connected, bindSocket, unbind, createRoom, joinRoom, leaveRoom, startGame, act, rebuy };
});

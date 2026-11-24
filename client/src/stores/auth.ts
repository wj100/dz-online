import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchMe, login as apiLogin, register as apiRegister, type UserInfo } from '../api/http';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem('dz_token') || '');
  const user = ref<UserInfo | null>(null);

  const isLoggedIn = computed(() => !!token.value);

  function setAuth(t: string, u: UserInfo): void {
    token.value = t;
    user.value = u;
    localStorage.setItem('dz_token', t);
  }

  async function register(username: string, password: string): Promise<void> {
    const res = await apiRegister(username, password);
    setAuth(res.token, res.user);
  }

  async function login(username: string, password: string): Promise<void> {
    const res = await apiLogin(username, password);
    setAuth(res.token, res.user);
  }

  async function loadMe(): Promise<void> {
    if (!token.value) return;
    try {
      user.value = await fetchMe();
    } catch {
      logout();
    }
  }

  function logout(): void {
    token.value = '';
    user.value = null;
    localStorage.removeItem('dz_token');
  }

  return { token, user, isLoggedIn, register, login, loadMe, logout };
});

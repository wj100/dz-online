import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory('/dz/'),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
    { path: '/', name: 'lobby', component: () => import('../views/LobbyView.vue') },
    { path: '/table', name: 'table', component: () => import('../views/TableView.vue') },
    { path: '/stats', name: 'stats', component: () => import('../views/StatsView.vue') },
  ],
});

router.beforeEach((to) => {
  const token = localStorage.getItem('dz_token');
  if (to.name !== 'login' && !token) return { name: 'login' };
  if (to.name === 'login' && token) return { name: 'lobby' };
  return true;
});

export default router;

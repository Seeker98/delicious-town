import type { Pinia } from 'pinia';
import { createRouter, createWebHistory, type Router, type RouteRecordRaw } from 'vue-router';
import { resolveGuard, type RouteFlags } from './guard';
import { useSessionStore } from './stores/session';

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('./views/LoginView.vue'),
    meta: { public: true, guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('./views/RegisterView.vue'),
    meta: { public: true, guestOnly: true },
  },
  {
    path: '/verify-email',
    name: 'verify-email',
    component: () => import('./views/VerifyEmailView.vue'),
    meta: { public: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('./views/ForgotPasswordView.vue'),
    meta: { public: true, guestOnly: true },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('./views/ResetPasswordView.vue'),
    meta: { public: true },
  },
  { path: '/shards', name: 'shards', component: () => import('./views/ShardSelectView.vue') },
  {
    path: '/create-restaurant',
    name: 'create-restaurant',
    component: () => import('./views/CreateRestaurantView.vue'),
  },
  {
    path: '/',
    name: 'home',
    component: () => import('./views/RestaurantHomeView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/more',
    name: 'more',
    component: () => import('./views/MoreView.vue'),
    meta: { needRestaurant: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export function createAppRouter(pinia: Pinia): Router {
  const router = createRouter({ history: createWebHistory(), routes });
  router.beforeEach(async (to) => {
    const session = useSessionStore(pinia);
    if (!session.loaded) await session.load();
    return resolveGuard(to.meta as RouteFlags, session.me, to.fullPath);
  });
  return router;
}

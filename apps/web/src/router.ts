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
    path: '/rest/floor',
    name: 'floor',
    component: () => import('./views/RestFloorView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/rest/income',
    name: 'income',
    component: () => import('./views/RestIncomeView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/rest/info',
    name: 'info',
    component: () => import('./views/RestInfoView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/rest/tasks',
    name: 'tasks',
    component: () => import('./views/RestTasksView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/rest/look',
    name: 'look',
    component: () => import('./views/RestLookView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/rest/equip',
    name: 'equip',
    component: () => import('./views/EquipView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/rest/equip/:id(\\d+)',
    name: 'equipDetail',
    component: () => import('./views/EquipDetailView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/rest/gem',
    name: 'gems',
    component: () => import('./views/GemView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/mc',
    name: 'mc',
    component: () => import('./views/McView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/temple',
    name: 'temple',
    component: () => import('./views/TempleView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/yard',
    name: 'yard',
    component: () => import('./views/YardView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/classroom',
    name: 'classroom',
    component: () => import('./views/ClassroomView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/cookbooks',
    name: 'cookbooks',
    component: () => import('./views/CookbooksView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/cookbooks/:id',
    name: 'cookbook',
    component: () => import('./views/CookbookInfoView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/cupboard',
    name: 'cupboard',
    component: () => import('./views/CupboardView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/market',
    name: 'market',
    component: () => import('./views/MarketView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/shop',
    name: 'shop',
    component: () => import('./views/ShopView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/store',
    name: 'store',
    component: () => import('./views/StoreView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/society',
    name: 'society',
    component: () => import('./views/SocietyView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/society/star',
    name: 'society-star',
    component: () => import('./views/SocietyStarView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/society/oil',
    name: 'society-oil',
    component: () => import('./views/SocietyOilView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/society/rename',
    name: 'society-rename',
    component: () => import('./views/SocietyRenameView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/society/move',
    name: 'society-move',
    component: () => import('./views/SocietyMoveView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/weather',
    name: 'weather',
    component: () => import('./views/WeatherView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/friends',
    name: 'friends',
    component: () => import('./views/FriendsView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/friends/:restId(\\d+)',
    name: 'friend-rest',
    component: () => import('./views/FriendRestView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/friends/:restId(\\d+)/flip',
    name: 'friend-flip',
    component: () => import('./views/FriendFlipView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/friends/:restId(\\d+)/exchange',
    name: 'friend-exchange',
    component: () => import('./views/FriendExchangeView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/more',
    name: 'more',
    component: () => import('./views/MoreView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/admin',
    component: () => import('./views/admin/AdminLayout.vue'),
    meta: { admin: true },
    children: [
      { path: 'shards/:id', component: () => import('./views/admin/AdminShardView.vue') },
      { path: 'shards/:id/history', component: () => import('./views/admin/AdminShardHistoryView.vue') },
      { path: 'players', component: () => import('./views/admin/AdminPlayersView.vue') },
      { path: 'players/:id', component: () => import('./views/admin/AdminPlayerView.vue') },
      { path: 'grants', component: () => import('./views/admin/AdminGrantsView.vue') },
      { path: '', component: () => import('./views/admin/AdminHomeView.vue') },
      { path: 'stats', component: () => import('./views/admin/AdminStatsView.vue') },
      { path: 'audit', component: () => import('./views/admin/AdminAuditView.vue') },
    ],
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

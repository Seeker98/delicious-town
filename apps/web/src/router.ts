import type { Pinia } from 'pinia';
import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
  type Router,
  type RouteRecordRaw,
} from 'vue-router';
import { goOrReload, installChunkReload } from './utils/chunkReload';
import { resolveGuard, type RouteFlags } from './guard';
import { activeMessages } from './i18n';
import { useSessionStore } from './stores/session';
import { useToastStore } from './stores/toast';

/** 广场搬到协会的标签（问题记录 441）：旧的 /town?tab=… 转到这里 */
const TOWN_MOVED: Record<string, string> = {
  exchange: '/society/mayor',
  classroom: '/society/classroom',
  fund: '/society/fund',
};

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
    path: '/account',
    name: 'account',
    component: () => import('./views/AccountView.vue'),
    meta: { gameChrome: true },
  },
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
    path: '/rest/activation',
    name: 'activation',
    component: () => import('./views/RestActivationView.vue'),
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
    path: '/bar',
    name: 'bar',
    component: () => import('./views/BarView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/tower',
    name: 'tower',
    component: () => import('./views/TowerView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/takeaway',
    name: 'takeaway',
    component: () => import('./views/TakeawayView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/town',
    name: 'town',
    component: () => import('./views/TownView.vue'),
    meta: { needRestaurant: true },
    // 教室、兑换、发展基金搬到了协会（问题记录 441）：旧链接、书签直接转过去
    beforeEnter: (to) => TOWN_MOVED[String(to.query.tab)] ?? true,
  },
  // 游戏资料（问题记录 142）：不用登录；已开店时显示底部导航
  {
    path: '/wiki',
    name: 'wiki',
    component: () => import('./views/wiki/WikiHomeView.vue'),
    meta: { public: true, gameChrome: true },
  },
  {
    path: '/wiki/guide',
    name: 'wiki-guide',
    component: () => import('./views/wiki/WikiGuideView.vue'),
    meta: { public: true, gameChrome: true },
  },
  {
    path: '/wiki/api',
    name: 'wiki-api',
    component: () => import('./views/wiki/WikiApiView.vue'),
    meta: { public: true, gameChrome: true },
  },
  {
    path: '/wiki/goods/:id(\\d+)',
    name: 'wiki-goods',
    component: () => import('./views/wiki/WikiGoodsView.vue'),
    meta: { public: true, gameChrome: true },
  },
  { path: '/wiki/equips/:id(\\d+)', redirect: (to) => `/wiki/goods/${String(to.params.id)}` },
  {
    path: '/wiki/foods/:id(\\d+)',
    name: 'wiki-food',
    component: () => import('./views/wiki/WikiFoodView.vue'),
    meta: { public: true, gameChrome: true },
  },
  {
    path: '/wiki/cookbooks/:id(\\d+)',
    name: 'wiki-cookbook',
    component: () => import('./views/wiki/WikiCookbookView.vue'),
    meta: { public: true, gameChrome: true },
  },
  {
    path: '/wiki/streets/:id(\\d+)',
    name: 'wiki-street',
    component: () => import('./views/wiki/WikiStreetView.vue'),
    meta: { public: true, gameChrome: true },
  },
  {
    path: '/wiki/:kind',
    name: 'wiki-list',
    component: () => import('./views/wiki/WikiListView.vue'),
    meta: { public: true, gameChrome: true },
  },
  // 更新记录、友情链接（问题记录 348）
  {
    path: '/changelog',
    name: 'changelog',
    component: () => import('./views/ChangelogView.vue'),
    meta: { gameChrome: true },
  },
  {
    path: '/links',
    name: 'links',
    component: () => import('./views/LinksView.vue'),
    meta: { gameChrome: true },
  },
  {
    path: '/guide',
    name: 'guide',
    component: () => import('./views/GuideView.vue'),
    meta: { gameChrome: true },
  },
  {
    path: '/redeem',
    name: 'redeem',
    component: () => import('./views/RedeemView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/invite',
    name: 'invite',
    component: () => import('./views/InviteView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/mail',
    name: 'mail',
    component: () => import('./views/MailView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/activities',
    name: 'activities',
    component: () => import('./views/ActivitiesView.vue'),
    meta: { needRestaurant: true },
  },
  // 教室先并进广场（问题记录 122），后来搬到协会（问题记录 441）：旧地址跳到协会的教室
  { path: '/classroom', redirect: '/society/classroom' },
  {
    path: '/cookbooks',
    name: 'cookbooks',
    component: () => import('./views/CookbooksView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/cookbooks/progress',
    name: 'cookbook-progress',
    component: () => import('./views/CookbookProgressView.vue'),
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
    path: '/exchange',
    name: 'exchange',
    component: () => import('./views/ExchangeView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/acquire',
    name: 'acquire',
    component: () => import('./views/AcquireView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/kuji',
    name: 'kuji',
    component: () => import('./views/KujiView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/predict',
    name: 'predict',
    component: () => import('./views/PredictView.vue'),
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
  // 从广场搬过来的教室、三位兑换 NPC、发展基金（问题记录 441、443）
  {
    path: '/society/:npc(classroom|mayor|bro13|carmen|fund)',
    name: 'society-npc',
    component: () => import('./views/SocietyNpcView.vue'),
    props: true,
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
    path: '/forum',
    name: 'forum',
    component: () => import('./views/ForumView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/forum/new',
    name: 'forum-new',
    component: () => import('./views/ForumEditView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/forum/:id(\\d+)/edit',
    name: 'forum-edit',
    component: () => import('./views/ForumEditView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/forum/:id(\\d+)',
    name: 'forum-post',
    component: () => import('./views/ForumPostView.vue'),
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
      { path: 'mail', component: () => import('./views/admin/AdminMailView.vue') },
      { path: 'titles', component: () => import('./views/admin/AdminTitlesView.vue') },
      { path: 'announce', component: () => import('./views/admin/AdminAnnounceView.vue') },
      { path: 'daily', component: () => import('./views/admin/AdminDailyView.vue') },
      { path: 'links', component: () => import('./views/admin/AdminLinksView.vue') },
      { path: 'activities', component: () => import('./views/admin/AdminActivitiesView.vue') },
      { path: 'predict', component: () => import('./views/admin/AdminPredictView.vue') },
      { path: 'codes', component: () => import('./views/admin/AdminCodesView.vue') },
      { path: 'reports', component: () => import('./views/admin/AdminReportsView.vue') },
      { path: 'suspicious', component: () => import('./views/admin/AdminSuspiciousView.vue') },
      { path: 'items', component: () => import('./views/admin/AdminItemsView.vue') },
      { path: '', component: () => import('./views/admin/AdminHomeView.vue') },
      { path: 'stats', component: () => import('./views/admin/AdminStatsView.vue') },
      { path: 'audit', component: () => import('./views/admin/AdminAuditView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

/** 等到条件成立（页面数据读回来以后才渲染、才变高），最多等 wait 毫秒；返回最后一次的结果 */
function waitUntil<T>(get: () => T, wait: number): Promise<T> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const v = get();
      if (v || Date.now() - start >= wait) resolve(v);
      else setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * 切页面时的滚动位置：原来不处理，在长页面往下滚后点进别的页，新页面停在同样的高度。
 * - 换了页面回到顶部；同一页只改地址参数（切标签、翻页）不动
 * - 后退、前进：等页面够高了再回到原来的位置（数据还没读回来时太短，太早滚会被截到底）
 * - 带 #锚点：先回到顶部，等那一块出现再滚过去（厨具页的加点框，530 遗留）；等不到就留在顶部
 * - 等的时候用户已经去了别的页（current 返回 false）就不再滚：vue-router 不管过时的滚动，会把那一页拉走（终审 I2）
 */
export async function scrollFor(
  to: Pick<RouteLocationNormalized, 'path' | 'hash'>,
  from: Pick<RouteLocationNormalized, 'path'>,
  saved: { left: number; top: number } | null,
  { current = () => true, wait = 3000 }: { current?: () => boolean; wait?: number } = {},
): Promise<{ el: Element; top: number } | { left: number; top: number } | { top: number } | false> {
  if (saved) {
    await waitUntil(() => document.documentElement.scrollHeight >= saved.top + window.innerHeight, wait);
    return current() ? saved : false;
  }
  if (to.hash) {
    window.scrollTo(0, 0);
    const el = await waitUntil(() => document.querySelector(to.hash), wait);
    return el && current() ? { el, top: 8 } : false;
  }
  return to.path !== from.path ? { top: 0 } : false;
}

export function createAppRouter(pinia: Pinia): Router {
  const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: (to, from, saved) =>
      scrollFor(to, from, saved, { current: () => router.currentRoute.value.fullPath === to.fullPath }),
  });
  router.beforeEach(async (to) => {
    const session = useSessionStore(pinia);
    if (!session.loaded) await session.load();
    return resolveGuard(to.meta as RouteFlags, session.me, to.fullPath);
  });
  // 发版后旧页面加载不到旧的页面文件：刷新一次转到要去的页面（问题记录 497）
  installChunkReload(router, goOrReload(), () =>
    useToastStore(pinia).push(activeMessages().common.offline, 'danger'),
  );
  return router;
}

import type { Pinia } from 'pinia';
import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
  type Router,
  type RouteRecordRaw,
} from 'vue-router';
import { BAR_GAMES, isBarGame } from './utils/barGames';
import { goOrReload, installChunkReload } from './utils/chunkReload';
import { resolveGuard, type RouteFlags } from './guard';
import { activeMessages } from './i18n';
import { useSessionStore } from './stores/session';
import { useToastStore } from './stores/toast';
import type { Messages } from './i18n';
import { listBack } from './nav/routeMeta';

/** 路由标题：取当前语言文案的函数（界面改版 P2a）；包一层只为类型推断 */
const T = (f: (t: Messages) => string) => f;

/** 广场搬到协会的标签（问题记录 441）：旧的 /town?tab=… 转到这里 */
const TOWN_MOVED: Record<string, string> = {
  exchange: '/society/mayor',
  classroom: '/society/classroom',
  // 基金后来又搬到银行（界面改版 P2b）
  fund: '/bank?tab=fund',
};

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('./views/LoginView.vue'),
    meta: { bare: true, public: true, guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('./views/RegisterView.vue'),
    meta: { bare: true, public: true, guestOnly: true },
  },
  {
    path: '/verify-email',
    name: 'verify-email',
    component: () => import('./views/VerifyEmailView.vue'),
    meta: { bare: true, public: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('./views/ForgotPasswordView.vue'),
    meta: { bare: true, public: true, guestOnly: true },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('./views/ResetPasswordView.vue'),
    meta: { bare: true, public: true },
  },
  // 切换区服（界面改版 P11）：已开店时有底部导航，返回到“我”；刚登录、还没进过区服时没有返回
  {
    path: '/shards',
    name: 'shards',
    component: () => import('./views/ShardSelectView.vue'),
    meta: { gameChrome: true, section: 'home', title: T((t) => t.account.shards.title), parent: '/me' },
  },
  {
    path: '/account',
    name: 'account',
    component: () => import('./views/AccountView.vue'),
    meta: { gameChrome: true, section: 'home', title: T((t) => t.account.title), parent: '/me' },
  },
  {
    path: '/create-restaurant',
    name: 'create-restaurant',
    component: () => import('./views/CreateRestaurantView.vue'),
    meta: { bare: true },
  },
  {
    path: '/',
    name: 'home',
    component: () => import('./views/RestaurantHomeView.vue'),
    // 有场景头图：顶栏用天空底色（界面改版 P5）
    meta: { needRestaurant: true, section: 'home', scene: true, title: T((t) => t.nav.tabs.rest) },
  },
  {
    path: '/rest/floor',
    name: 'floor',
    component: () => import('./views/RestFloorView.vue'),
    meta: { needRestaurant: true, section: 'home', title: T((t) => t.nav.titles.floor), parent: '/' },
  },
  {
    path: '/rest/income',
    name: 'income',
    component: () => import('./views/RestIncomeView.vue'),
    meta: { needRestaurant: true, section: 'home', title: T((t) => t.nav.titles.income), parent: '/' },
  },
  {
    path: '/rest/info',
    name: 'info',
    component: () => import('./views/RestInfoView.vue'),
    meta: { needRestaurant: true, section: 'home', title: T((t) => t.nav.titles.info), parent: '/me' },
  },
  // 签到和今日活跃并进任务页的“今日”标签（界面改版 P2b）
  { path: '/rest/activation', redirect: '/rest/tasks?tab=today' },
  {
    path: '/rest/tasks',
    name: 'tasks',
    component: () => import('./views/RestTasksView.vue'),
    meta: { needRestaurant: true, section: 'home', title: T((t) => t.nav.titles.tasks), parent: '/' },
  },
  {
    path: '/rest/look',
    name: 'look',
    component: () => import('./views/RestLookView.vue'),
    meta: { needRestaurant: true, section: 'home', title: T((t) => t.rest.look.title), parent: '/me' },
  },
  {
    path: '/rest/equip',
    name: 'equip',
    component: () => import('./views/EquipView.vue'),
    meta: { needRestaurant: true, section: 'home', title: T((t) => t.equip.title), parent: '/me' },
  },
  {
    path: '/rest/equip/:id(\\d+)',
    name: 'equipDetail',
    component: () => import('./views/EquipDetailView.vue'),
    meta: {
      needRestaurant: true,
      section: 'home',
      title: T((t) => t.nav.titles.equipDetail),
      parent: '/rest/equip',
    },
  },
  // 宝石并进厨具页的标签（界面改版 P2b）
  { path: '/rest/gem', redirect: '/rest/equip?tab=gem' },

  // 特色菜并进食谱页的标签（界面改版 P2b）
  { path: '/mc', redirect: '/cookbooks?tab=mc' },
  {
    path: '/temple',
    name: 'temple',
    component: () => import('./views/TempleView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.temple.title), parent: '/map' },
  },
  {
    path: '/bar',
    name: 'bar',
    component: () => import('./views/BarView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.bar.title), parent: '/map' },
    // 原来十个游戏是标签（?tab=）：旧链接跳到游戏页（界面改版 P9）
    beforeEnter: (to) => (isBarGame(to.query.tab) ? `/bar/${to.query.tab}` : true),
  },
  // 每个游戏单独一页（界面改版 P9）
  ...BAR_GAMES.map((game) => ({
    path: `/bar/${game}`,
    name: `bar-${game}`,
    component: () => import('./views/BarGameView.vue'),
    props: { game },
    meta: {
      needRestaurant: true,
      section: 'map' as const,
      title: T((t) => t.bar.tabs[game]),
      parent: '/bar',
    },
  })),
  {
    path: '/tower',
    name: 'tower',
    component: () => import('./views/TowerView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.tower.title), parent: '/map' },
  },
  {
    path: '/takeaway',
    name: 'takeaway',
    component: () => import('./views/TakeawayView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.takeaway.title), parent: '/map' },
  },
  {
    path: '/town',
    name: 'town',
    component: () => import('./views/TownView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.town.title), parent: '/map' },
    // 教室、兑换、发展基金搬到了协会（问题记录 441）：旧链接、书签直接转过去
    beforeEnter: (to) => TOWN_MOVED[String(to.query.tab)] ?? true,
  },
  // 游戏资料（问题记录 142）：不用登录；已开店时显示底部导航
  {
    path: '/wiki',
    name: 'wiki',
    component: () => import('./views/wiki/WikiHomeView.vue'),
    meta: { public: true, gameChrome: true, section: 'home', title: T((t) => t.wiki.title), parent: '/help' },
  },
  {
    path: '/wiki/guide',
    name: 'wiki-guide',
    component: () => import('./views/wiki/WikiGuideView.vue'),
    meta: {
      public: true,
      gameChrome: true,
      section: 'home',
      title: T((t) => t.wiki.guide.title),
      parent: '/help',
    },
  },
  {
    path: '/wiki/api',
    name: 'wiki-api',
    component: () => import('./views/wiki/WikiApiView.vue'),
    meta: {
      public: true,
      gameChrome: true,
      section: 'home',
      title: T((t) => t.wiki.api.title),
      parent: '/help',
    },
  },
  {
    path: '/wiki/goods/:id(\\d+)',
    name: 'wiki-goods',
    component: () => import('./views/wiki/WikiGoodsView.vue'),
    meta: {
      public: true,
      gameChrome: true,
      section: 'home',
      title: T((t) => t.nav.titles.wikiItem),
      parent: (_to, back) =>
        typeof back === 'string' && back.startsWith('/wiki/equips')
          ? listBack('/wiki/equips', back)
          : listBack('/wiki/goods', back),
    },
  },
  { path: '/wiki/equips/:id(\\d+)', redirect: (to) => `/wiki/goods/${String(to.params.id)}` },
  {
    path: '/wiki/foods/:id(\\d+)',
    name: 'wiki-food',
    component: () => import('./views/wiki/WikiFoodView.vue'),
    meta: {
      public: true,
      gameChrome: true,
      section: 'home',
      title: T((t) => t.nav.titles.wikiItem),
      parent: (_to, back) => listBack('/wiki/foods', back),
    },
  },
  {
    path: '/wiki/cookbooks/:id(\\d+)',
    name: 'wiki-cookbook',
    component: () => import('./views/wiki/WikiCookbookView.vue'),
    meta: {
      public: true,
      gameChrome: true,
      section: 'home',
      title: T((t) => t.nav.titles.wikiItem),
      parent: (_to, back) => listBack('/wiki/cookbooks', back),
    },
  },
  {
    path: '/wiki/streets/:id(\\d+)',
    name: 'wiki-street',
    component: () => import('./views/wiki/WikiStreetView.vue'),
    meta: {
      public: true,
      gameChrome: true,
      section: 'home',
      title: T((t) => t.nav.titles.wikiItem),
      parent: (_to, back) => listBack('/wiki/streets', back),
    },
  },
  {
    path: '/wiki/:kind',
    name: 'wiki-list',
    component: () => import('./views/wiki/WikiListView.vue'),
    meta: { public: true, gameChrome: true, section: 'home', title: T((t) => t.wiki.title), parent: '/wiki' },
  },
  // 更新记录、友情链接（问题记录 348）
  {
    path: '/changelog',
    name: 'changelog',
    component: () => import('./views/ChangelogView.vue'),
    meta: { gameChrome: true, section: 'home', title: T((t) => t.site.changelogTitle), parent: '/help' },
  },
  {
    path: '/links',
    name: 'links',
    component: () => import('./views/LinksView.vue'),
    meta: { gameChrome: true, section: 'home', title: T((t) => t.site.linksTitle), parent: '/help' },
  },
  {
    path: '/guide',
    name: 'guide',
    component: () => import('./views/GuideView.vue'),
    // 没登录也能看（界面改版 P11：登录页的胶囊）
    meta: {
      public: true,
      gameChrome: true,
      section: 'home',
      title: T((t) => t.guide.title),
      parent: '/help',
    },
  },
  {
    path: '/redeem',
    name: 'redeem',
    component: () => import('./views/RedeemView.vue'),
    meta: { needRestaurant: true, section: 'home', title: T((t) => t.nav.me.redeem), parent: '/me' },
  },
  {
    path: '/invite',
    name: 'invite',
    component: () => import('./views/InviteView.vue'),
    // 入口在兑换码页（界面改版 P2b，原来在账号页）
    meta: { needRestaurant: true, section: 'home', title: T((t) => t.misc.invite.title), parent: '/redeem' },
  },
  {
    path: '/mail',
    name: 'mail',
    component: () => import('./views/MailView.vue'),
    meta: { needRestaurant: true, section: 'home', title: T((t) => t.mail.title), parent: '/' },
  },
  {
    path: '/activities',
    name: 'activities',
    component: () => import('./views/ActivitiesView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.activity.title), parent: '/map' },
  },
  // 教室先并进广场（问题记录 122），后来搬到协会（问题记录 441）：旧地址跳到协会的教室
  { path: '/classroom', redirect: '/society/classroom' },
  {
    path: '/cookbooks',
    name: 'cookbooks',
    component: () => import('./views/CookbooksView.vue'),
    meta: { needRestaurant: true, section: 'cookbooks', title: T((t) => t.nav.titles.cookbooks) },
  },
  // 进度一览并进食谱页的标签（界面改版 P2b）：带着原来看的街、页码、筛选
  {
    path: '/cookbooks/progress',
    redirect: (to) => ({ path: '/cookbooks', query: { ...to.query, tab: 'progress' } }),
  },
  {
    path: '/cookbooks/:id',
    name: 'cookbook',
    component: () => import('./views/CookbookInfoView.vue'),
    meta: {
      needRestaurant: true,
      section: 'cookbooks',
      title: T((t) => t.nav.titles.cookbook),
      parent: '/cookbooks',
    },
  },
  {
    path: '/cupboard',
    name: 'cupboard',
    component: () => import('./views/CupboardView.vue'),
    meta: { needRestaurant: true, section: 'cupboard', title: T((t) => t.nav.titles.cupboard) },
  },
  {
    path: '/market',
    name: 'market',
    component: () => import('./views/MarketView.vue'),
    meta: { needRestaurant: true, section: 'market', title: T((t) => t.nav.titles.market) },
  },
  {
    path: '/exchange',
    name: 'exchange',
    component: () => import('./views/ExchangeView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.exchange.title), parent: '/map' },
  },
  {
    path: '/acquire',
    name: 'acquire',
    component: () => import('./views/AcquireView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.acquire.title), parent: '/map' },
  },
  {
    path: '/kuji',
    name: 'kuji',
    component: () => import('./views/KujiView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.kuji.title), parent: '/map' },
  },
  {
    path: '/predict',
    name: 'predict',
    component: () => import('./views/PredictView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.predict.title), parent: '/map' },
  },
  {
    // 事件详情单独一页（界面改版 P8）：行情、持仓、买卖、记录
    path: '/predict/:id(\\d+)',
    name: 'predict-detail',
    component: () => import('./views/PredictDetailView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.predict.title), parent: '/predict' },
  },
  {
    path: '/shop',
    name: 'shop',
    component: () => import('./views/ShopView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.nav.titles.shop), parent: '/map' },
  },
  {
    path: '/store',
    name: 'store',
    component: () => import('./views/StoreView.vue'),
    meta: { needRestaurant: true, section: 'home', title: T((t) => t.nav.titles.store), parent: '/me' },
  },
  {
    path: '/society',
    name: 'society',
    component: () => import('./views/SocietyView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.society.title), parent: '/map' },
  },
  // 盖乐瑞的基金、理财搬到银行（界面改版 P2b）
  { path: '/society/fund', redirect: '/bank?tab=fund' },
  { path: '/society/wealth', redirect: '/bank?tab=wealth' },
  {
    path: '/bank',
    name: 'bank',
    component: () => import('./views/BankView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.nav.titles.bank), parent: '/map' },
  },
  // 从广场搬过来的教室、三位兑换 NPC（问题记录 441、443）
  {
    path: '/society/:npc(classroom|mayor|bro13|carmen)',
    name: 'society-npc',
    component: () => import('./views/SocietyNpcView.vue'),
    props: true,
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.society.title), parent: '/society' },
  },
  {
    path: '/society/star',
    name: 'society-star',
    component: () => import('./views/SocietyStarView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.society.title), parent: '/society' },
  },
  {
    path: '/society/oil',
    name: 'society-oil',
    component: () => import('./views/SocietyOilView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.society.title), parent: '/society' },
  },
  // 改名、搬家改成协会首页的面板（界面改版 P10）：旧地址（食谱页的搬家提示）带 ?sheet= 打开面板
  { path: '/society/rename', redirect: { path: '/society', query: { sheet: 'rename' } } },
  { path: '/society/move', redirect: { path: '/society', query: { sheet: 'move' } } },
  {
    path: '/weather',
    name: 'weather',
    component: () => import('./views/WeatherView.vue'),
    meta: { needRestaurant: true, section: 'home', title: T((t) => t.nav.titles.weather), parent: '/' },
  },
  {
    path: '/friends',
    name: 'friends',
    component: () => import('./views/FriendsView.vue'),
    meta: { needRestaurant: true, section: 'friends', title: T((t) => t.nav.titles.friends) },
  },
  {
    path: '/forum',
    name: 'forum',
    component: () => import('./views/ForumView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.forum.title), parent: '/map' },
  },
  {
    path: '/forum/new',
    name: 'forum-new',
    component: () => import('./views/ForumEditView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.forum.title), parent: '/forum' },
  },
  {
    path: '/forum/:id(\\d+)/edit',
    name: 'forum-edit',
    component: () => import('./views/ForumEditView.vue'),
    meta: {
      needRestaurant: true,
      section: 'map',
      title: T((t) => t.forum.title),
      parent: (to) => `/forum/${String(to.params.id)}`,
    },
  },
  {
    path: '/forum/:id(\\d+)',
    name: 'forum-post',
    component: () => import('./views/ForumPostView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.nav.titles.forumPost), parent: '/forum' },
  },
  {
    path: '/friends/:restId(\\d+)',
    name: 'friend-rest',
    component: () => import('./views/FriendRestView.vue'),
    meta: {
      needRestaurant: true,
      section: 'friends',
      title: T((t) => t.nav.titles.friendRest),
      parent: '/friends',
    },
  },
  {
    path: '/friends/:restId(\\d+)/flip',
    name: 'friend-flip',
    component: () => import('./views/FriendFlipView.vue'),
    meta: {
      needRestaurant: true,
      section: 'friends',
      title: T((t) => t.friends.flip.title),
      parent: (to) => `/friends/${String(to.params.restId)}`,
    },
  },
  {
    path: '/friends/:restId(\\d+)/exchange',
    name: 'friend-exchange',
    component: () => import('./views/FriendExchangeView.vue'),
    meta: {
      needRestaurant: true,
      section: 'friends',
      title: T((t) => t.friends.exchange.title),
      parent: (to) => `/friends/${String(to.params.restId)}`,
    },
  },
  // 小镇、我、帮助中心（界面改版 P2a，设计 §4.1）；“更多”换成了小镇
  {
    path: '/map',
    name: 'map',
    component: () => import('./views/MapView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.nav.titles.map) },
  },
  {
    path: '/me',
    name: 'me',
    component: () => import('./views/MeView.vue'),
    meta: { needRestaurant: true, section: 'home', title: T((t) => t.nav.titles.me), parent: '/' },
  },
  {
    path: '/help',
    name: 'help',
    component: () => import('./views/HelpView.vue'),
    meta: { gameChrome: true, section: 'home', title: T((t) => t.nav.titles.help), parent: '/me' },
  },
  { path: '/more', redirect: '/map' },
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
      { path: 'futures', component: () => import('./views/admin/AdminFuturesView.vue') },
      { path: 'bulk', component: () => import('./views/admin/AdminBulkView.vue') },
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
  // 开发用图库（界面改版 P1）：只在开发环境注册，生产构建里连页面文件都不打包
  ...(import.meta.env.DEV
    ? [
        {
          path: '/dev/art',
          name: 'dev-art',
          component: () => import('./views/dev/ArtGalleryView.vue'),
          meta: { public: true },
        } satisfies RouteRecordRaw,
      ]
    : []),
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
    // 顶栏吸顶 48px（界面改版 P2a）：停在顶栏下面 8px
    return el && current() ? { el, top: 56 } : false;
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

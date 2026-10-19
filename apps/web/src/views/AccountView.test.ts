import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AccountProfileDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import AccountView from './AccountView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    accountProfile: vi.fn(),
    changePassword: vi.fn(),
    changeEmail: vi.fn(),
    sendVerifyEmail: vi.fn(),
    selectShard: vi.fn(),
    listShards: vi.fn(),
    logout: vi.fn(),
  },
}));

const profile = (patch: Partial<AccountProfileDto> = {}): AccountProfileDto => ({
  username: 'u1',
  email: 'u@x',
  emailVerified: true,
  role: 'player',
  createdAt: '2026-09-30T00:00:00Z',
  inviteCode: null,
  rests: [{ shardId: 1, shardName: '一服', shardOpen: true, restId: 5, name: '小店', level: 12 }],
  ...patch,
});
const mountView = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: AccountView },
      { path: '/login', name: 'login', component: { template: '<div />' } },
      { path: '/shards', name: 'shards', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  // 修改密码、语言、外观都在 Teleport 到 body 的底部面板里：测试里把 teleport 桩掉（界面改版 P11）
  const w = mount(AccountView, { global: { plugins: [router], stubs: { teleport: true } } });
  await flushPromises();
  return { w, router };
};

describe('AccountView（问题记录 178；界面改版 P11）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.changePassword).mockReset();
    vi.mocked(endpoints.sendVerifyEmail).mockReset();
    vi.mocked(endpoints.listShards).mockResolvedValue([]);
    vi.mocked(endpoints.accountProfile).mockResolvedValue(profile());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('顶上一张账号卡：用户名、注册时间和几个区服有店；普通玩家不显示身份', async () => {
    const { w } = await mountView();
    const card = w.get('[data-testid="acc-info"]');
    expect(card.text()).toContain('u1');
    expect(card.text()).toContain('注册 · 1 个区服有店');
    expect(card.find('.dt-tag').exists()).toBe(false);
    expect(w.text()).not.toContain('管理员');
  });

  it('管理员在名字后面带身份小标签；一家店都没开写“还没开店”', async () => {
    vi.mocked(endpoints.accountProfile).mockResolvedValue(profile({ role: 'admin', rests: [] }));
    const { w } = await mountView();
    const card = w.get('[data-testid="acc-info"]');
    expect(card.get('.dt-tag').text()).toBe('管理员');
    expect(card.text()).toContain('还没开店');
  });

  it('邮箱行：已验证只写标签；没验证有重发按钮，点了发验证邮件并提示', async () => {
    const { w: ok } = await mountView();
    expect(ok.get('[data-testid="acc-email"]').text()).toContain('已验证');
    expect(ok.find('[data-testid="acc-resend"]').exists()).toBe(false);

    vi.mocked(endpoints.accountProfile).mockResolvedValue(profile({ emailVerified: false }));
    vi.mocked(endpoints.sendVerifyEmail).mockResolvedValue({} as never);
    const { w } = await mountView();
    const row = w.get('[data-testid="acc-email"]');
    expect(row.text()).toContain('u@x');
    expect(row.text()).toContain('没验证');
    await w.get('[data-testid="acc-resend"]').trigger('click');
    await flushPromises();
    expect(endpoints.sendVerifyEmail).toHaveBeenCalledTimes(1);
    expect(useToastStore().items.at(-1)?.variant).toBe('success');
  });

  it('改邮箱（2026-10-19）：验证过的没有入口；没验证的点开面板，填新邮箱和密码，改好后行里换成新邮箱', async () => {
    const { w: ok } = await mountView();
    expect(ok.find('[data-testid="acc-email-change"]').exists()).toBe(false);

    vi.mocked(endpoints.accountProfile).mockResolvedValue(
      profile({ emailVerified: false, email: 'u@x.con' }),
    );
    vi.mocked(endpoints.changeEmail).mockResolvedValue({ email: 'u@x.com', mailSent: true });
    const { w } = await mountView();
    await w.get('[data-testid="acc-email-change"]').trigger('click');
    expect(w.text()).toContain('现在是 u@x.con');
    const save = w.get('[data-testid="acc-email-save"]');
    expect(save.attributes('disabled')).toBeDefined();
    await w.get('[data-testid="acc-new-email"]').setValue('u@x.com');
    await w.get('[data-testid="acc-email-pw"]').setValue('secret123');
    await w.get('#dt-email-form').trigger('submit');
    await flushPromises();
    expect(endpoints.changeEmail).toHaveBeenCalledWith({ email: 'u@x.com', password: 'secret123' });
    expect(w.get('[data-testid="acc-email"]').text()).toContain('u@x.com');
    expect(w.find('[data-testid="acc-email-save"]').exists()).toBe(false);
    expect(useToastStore().items.at(-1)?.text).toBe('邮箱已改成 u@x.com, 验证邮件已发出');
  });

  it('“修改密码”行点开密码面板，三格都在', async () => {
    const { w } = await mountView();
    expect(w.find('[data-testid="acc-old"]').exists()).toBe(false);
    await w.get('[data-testid="acc-pw"]').trigger('click');
    for (const id of ['acc-old', 'acc-new', 'acc-new2', 'acc-change'])
      expect(w.find(`[data-testid="${id}"]`).exists()).toBe(true);
  });

  it('语言、外观行写着当前值，点开对应面板（问题记录 300 的下拉框改成面板）', async () => {
    const { w } = await mountView();
    expect(w.get('[data-testid="acc-lang"]').text()).toContain('简体中文');
    expect(w.get('[data-testid="acc-theme"]').text()).toContain('跟随系统');
    await w.get('[data-testid="acc-lang"]').trigger('click');
    expect(w.find('[data-testid="lang-en"]').exists()).toBe(true);
    expect(w.find('[data-testid="theme-dark"]').exists()).toBe(false);
    await w.get('[data-testid="acc-theme"]').trigger('click');
    expect(w.find('[data-testid="lang-en"]').exists()).toBe(false);
    await w.get('[data-testid="theme-dark"]').trigger('click');
    // 选了深色：面板关掉，行里的值跟着变
    expect(w.find('[data-testid="theme-dark"]').exists()).toBe(false);
    expect(w.get('[data-testid="acc-theme"]').text()).toContain('深色');
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('切换区服行链到 /shards（“我的店”列表挪到那一页）', async () => {
    const { w } = await mountView();
    expect(w.get('[data-testid="acc-shards"]').attributes('href')).toBe('/shards');
    expect(w.find('[data-testid="acc-rest-1"]').exists()).toBe(false);
  });

  it('退出登录先确认：取消什么都不做；确认后退出并去登录页', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(endpoints.logout).mockResolvedValue({} as never);
    const { w, router } = await mountView();
    await w.get('[data-testid="acc-logout"]').trigger('click');
    await flushPromises();
    expect(ask).toHaveBeenCalledWith('退出登录？');
    expect(endpoints.logout).not.toHaveBeenCalled();
    ask.mockReturnValue(true);
    await w.get('[data-testid="acc-logout"]').trigger('click');
    await flushPromises();
    expect(endpoints.logout).toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('改完密码服务端要求重新登录：会话清掉', async () => {
    vi.mocked(endpoints.changePassword).mockResolvedValue({ relogin: true } as never);
    useSessionStore().me = { accountId: 1, username: 'u1' } as never;
    const { w } = await mountView();
    await w.get('[data-testid="acc-pw"]').trigger('click');
    await w.get('[data-testid="acc-old"]').setValue('secret123');
    await w.get('[data-testid="acc-new"]').setValue('newpass123');
    await w.get('[data-testid="acc-new2"]').setValue('newpass123');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(useSessionStore().me).toBeNull();
    // 面板跟着关掉
    expect(w.find('[data-testid="acc-old"]').exists()).toBe(false);
  });
});

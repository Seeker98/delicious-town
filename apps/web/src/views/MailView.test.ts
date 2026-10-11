import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import MailView from './MailView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    mail: vi.fn(),
    mailUnread: vi.fn(),
    mailRead: vi.fn(),
    mailClaim: vi.fn(),
    mailClaimAll: vi.fn(),
    mailDelete: vi.fn(),
  },
}));

const mail = (patch: Partial<MailDto> = {}): MailDto => ({
  id: 1,
  title: '开服礼',
  body: '欢迎\n来到小镇',
  tpl: null,
  items: { coin: 100, hats: [{ tier: 'jade', name: '大橘' }] },
  source: 'admin',
  createdAt: '2026-10-01T00:00:00.000Z',
  expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  read: false,
  claimed: false,
  minLevel: null,
  broken: false,
  ...patch,
});

// 点一封邮件从 Teleport 到 body 的底部面板弹出正文：测试里把 teleport 桩掉（界面改版 P10）
describe('MailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    useRestaurantStore().rest = { level: 5 } as never;
    vi.mocked(endpoints.mail).mockResolvedValue({ items: [mail()], unread: 1, level: 5 });
    vi.mocked(endpoints.mailUnread).mockResolvedValue({ count: 0 });
    vi.mocked(endpoints.mailClaim).mockResolvedValue({ id: 1, items: { coin: 100 } });
    vi.mocked(endpoints.mailRead).mockResolvedValue(undefined as never);
  });

  it('列出邮件：附件摘要（含命名帽子）、剩余天数；领取后重新读取', async () => {
    const w = mount(MailView, { global: { stubs: { RouterLink: RouterLinkStub, teleport: true } } });
    await flushPromises();
    expect(w.text()).toContain('开服礼');
    expect(w.text()).toContain('银币 100');
    expect(w.text()).toContain('玉•大橘之帽');
    expect(w.text()).toContain('还剩 3 天');
    await w.find('[data-testid="mail-claim-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.mailClaim).toHaveBeenCalledWith(1);
    expect(endpoints.mail).toHaveBeenCalledTimes(2);
  });

  it('等级不够时领取按钮禁用并写明要几级；展开正文时标记已读，换行保留', async () => {
    vi.mocked(endpoints.mail).mockResolvedValue({ items: [mail({ minLevel: 10 })], unread: 1, level: 5 });
    const w = mount(MailView, { global: { stubs: { RouterLink: RouterLinkStub, teleport: true } } });
    await flushPromises();
    // 界面改版 P10：等级不够时这一行不放领取按钮，换成“需 10 级”标签；面板里的领取灰掉
    expect(w.find('[data-testid="mail-claim-1"]').exists()).toBe(false);
    expect(w.find('[data-testid="mail-level-1"]').text()).toBe('需 10 级');
    expect(w.find('[data-testid="mail-claim-all"]').exists()).toBe(false);
    await w.find('[data-testid="mail-title-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.mailRead).toHaveBeenCalledWith(1);
    expect(w.find('[data-testid="mail-body-1"]').text()).toContain('欢迎\n来到小镇');
    expect(w.find('[data-testid="mail-sheet-claim"]').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('· 需 10 级');
  });

  it('领完的邮件显示删除；一键领取汇报失败封数', async () => {
    vi.mocked(endpoints.mail).mockResolvedValue({
      items: [mail({ id: 2, claimed: true }), mail({ id: 3 })],
      unread: 0,
      level: 5,
    });
    vi.mocked(endpoints.mailClaimAll).mockResolvedValue({ claimed: 0, failed: 1, items: [] });
    const w = mount(MailView, { global: { stubs: { RouterLink: RouterLinkStub, teleport: true } } });
    await flushPromises();
    // 界面改版 P10：领完的这一行写“已领取”，删除在点开的面板里
    expect(w.find('[data-testid="mail-2"]').text()).toContain('已领取');
    expect(w.find('[data-testid="mail-claim-2"]').exists()).toBe(false);
    await w.find('[data-testid="mail-title-2"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="mail-sheet-delete"]').exists()).toBe(true);
    expect(w.find('[data-testid="mail-sheet-claim"]').exists()).toBe(false);
    await w.find('[data-testid="mail-claim-all"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('1 封没领成');
  });

  it('等级按邮箱接口返回的当前等级判断，不依赖餐厅 store 是否加载（终审 I1）', async () => {
    useRestaurantStore().rest = null;
    vi.mocked(endpoints.mail).mockResolvedValue({ items: [mail({ minLevel: 10 })], unread: 1, level: 12 });
    const w = mount(MailView, { global: { stubs: { RouterLink: RouterLinkStub, teleport: true } } });
    await flushPromises();
    expect(w.find('[data-testid="mail-claim-1"]').attributes('disabled')).toBeUndefined();
    expect(w.text()).not.toContain('需 10 级');
  });

  it('附件失效的邮件不显示领取按钮，写明失效，可以删除；不计入一键领取', async () => {
    vi.mocked(endpoints.mail).mockResolvedValue({
      items: [mail({ id: 9, broken: true })],
      unread: 0,
      level: 5,
    });
    const w = mount(MailView, { global: { stubs: { RouterLink: RouterLinkStub, teleport: true } } });
    await flushPromises();
    expect(w.find('[data-testid="mail-claim-9"]').exists()).toBe(false);
    expect(w.find('[data-testid="mail-9"]').text()).toContain('附件失效');
    // 一键领取没有可领的就不显示（界面改版 P10，原来是灰掉）
    expect(w.find('[data-testid="mail-claim-all"]').exists()).toBe(false);
    // 删除在点开的面板里（界面改版 P10）
    vi.mocked(endpoints.mailDelete).mockResolvedValue(undefined as never);
    await w.find('[data-testid="mail-title-9"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('附件已失效');
    expect(w.find('[data-testid="mail-sheet-claim"]').exists()).toBe(false);
    await w.find('[data-testid="mail-sheet-delete"]').trigger('click');
    await flushPromises();
    expect(endpoints.mailDelete).toHaveBeenCalledWith(9);
  });

  it('领到的称号已过期：领取后提示（单封、一键都提示；定制称号设计 四）', async () => {
    const expired = { key: 'c9', title: '过期了', until: '2026-10-01T00:00:00Z', expired: true as const };
    vi.mocked(endpoints.mailClaim).mockResolvedValue({ id: 1, items: { icons: [expired] } });
    const w = mount(MailView, { global: { stubs: { RouterLink: RouterLinkStub, teleport: true } } });
    await flushPromises();
    await w.find('[data-testid="mail-claim-1"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.map((x) => x.text)).toContain('称号「过期了」已过期');
    useToastStore().items = [];
    vi.mocked(endpoints.mailClaimAll).mockResolvedValue({
      claimed: 2,
      failed: 0,
      items: [{ coin: 1 }, { icons: [expired] }],
    });
    await w.find('[data-testid="mail-claim-all"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.map((x) => x.text)).toContain('称号「过期了」已过期');
  });

  it('兑换码只留在兑换码页：这里没有兑换框，只有一条链接（界面改版 P2b）', async () => {
    const w = mount(MailView, { global: { stubs: { RouterLink: RouterLinkStub, teleport: true } } });
    await flushPromises();
    expect(w.find('[data-testid="redeem-input"]').exists()).toBe(false);
    expect(w.get('[data-testid="mail-to-redeem"]').findComponent(RouterLinkStub).props('to')).toBe('/redeem');
  });
});

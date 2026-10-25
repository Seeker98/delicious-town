import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminSuspiciousView from './AdminSuspiciousView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    suspiciousBar: vi.fn(),
    suspiciousSurge: vi.fn(),
    suspiciousMulti: vi.fn(),
    suspiciousApi: vi.fn(),
    suspiciousRedeem: vi.fn(),
    suspiciousAcquire: vi.fn(),
    accessBans: vi.fn(),
    addAccessBan: vi.fn(),
    removeAccessBan: vi.fn(),
  },
}));

const who = { restId: 3, restName: '可疑店', accountId: 9, username: 'sus' };

async function mountView(role: 'mod' | 'admin' = 'mod') {
  useAdminStore().me = { accountId: 1, username: 'boss', role };
  useAdminStore().shardId = 1;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
  });
  const w = mount(AdminSuspiciousView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('AdminSuspiciousView（子项目 6B-2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.suspiciousBar).mockResolvedValue([
      { ...who, perfectSum: 9, perfectMax: 5, bullSum: 0, bullMax: 0, flagged: true },
    ]);
    vi.mocked(adminApi.suspiciousSurge).mockResolvedValue({
      day: '2026-09-30',
      coin: [{ ...who, net: 1_000_000, topSources: [{ source: 'tower.challenge', delta: 1_000_000 }] }],
      diamond: [],
      exp: [],
    });
    vi.mocked(adminApi.suspiciousMulti).mockResolvedValue([
      {
        kind: 'ip',
        key: '10.0.0.1',
        total: 3,
        accounts: [1, 2, 3].map((i) => ({
          accountId: i,
          username: `u${i}`,
          restId: i,
          restName: `店${i}`,
          lastSeen: '2026-10-01T00:00:00.000Z',
        })),
      },
    ]);
    vi.mocked(adminApi.suspiciousRedeem).mockResolvedValue([]);
  });

  it('默认看酒吧：超过门槛的标红，链接到玩家页；顶部写明只作提醒', async () => {
    const w = await mountView();
    expect(adminApi.suspiciousBar).toHaveBeenCalledWith(1);
    expect(w.text()).toContain('只作提醒');
    const row = w.find('[data-testid="sus-bar-3"]');
    expect(row.classes()).toContain('is-bad');
    expect(row.find('a').attributes('href')).toBe('/admin/players/9');
  });

  it('资源暴涨：可选日期，显示来源', async () => {
    const w = await mountView();
    await w.find('[data-testid="sus-tab-surge"]').trigger('click');
    await flushPromises();
    expect(adminApi.suspiciousSurge).toHaveBeenCalledWith(1, undefined);
    expect(w.text()).toContain('tower.challenge +1,000,000');
    await w.find('[data-testid="sus-day"]').setValue('2026-09-29');
    await flushPromises();
    expect(adminApi.suspiciousSurge).toHaveBeenLastCalledWith(1, '2026-09-29');
  });

  it('接口调用（2026-10-24）：开放接口没带 lang 的标红、列出 IP 上的账号；没带设备号的请求列账号和标识', async () => {
    vi.mocked(adminApi.suspiciousApi).mockResolvedValue({
      open: [
        {
          ip: '10.0.0.9',
          userAgent: 'python-requests/2.31',
          origin: '',
          n: 12,
          noLang: 12,
          days: 1,
          firstSeen: '2026-10-24T11:40:00.000Z',
          lastSeen: '2026-10-24T11:42:00.000Z',
          accounts: [{ accountId: 9, username: 'sus' }],
        },
      ],
      bare: [
        {
          accountId: 9,
          username: 'sus',
          restId: 3,
          restName: '可疑店',
          ip: '10.0.0.9',
          userAgent: null,
          firstSeen: '2026-10-22T05:33:00.000Z',
          lastSeen: '2026-10-22T05:33:00.000Z',
        },
      ],
    });
    const w = await mountView();
    await w.get('[data-testid="sus-tab-api"]').trigger('click');
    await flushPromises();
    expect(adminApi.suspiciousApi).toHaveBeenCalledWith(1);
    const open = w.get('[data-testid="sus-api-open-0"]');
    expect(open.classes()).toContain('is-bad');
    expect(open.text()).toContain('python-requests/2.31');
    expect(open.text()).toContain('12 (12)');
    expect(open.text()).toContain('sus');
    const bare = w.get('[data-testid="sus-api-bare-0"]');
    expect(bare.text()).toContain('可疑店');
    expect(bare.text()).toContain('（之前没记）');
  });

  it('多号：按 IP 分组列出账号', async () => {
    const w = await mountView();
    await w.find('[data-testid="sus-tab-multi"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('同一 IP：10.0.0.1');
    expect(w.findAll('[data-testid="sus-multi-account"]')).toHaveLength(3);
  });
});

describe('操作节奏跳到多号（防脚本 2026-10-25 审阅）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.suspiciousBar).mockResolvedValue([]);
    const acct = (i: number) => ({
      accountId: i,
      username: `u${i}`,
      restId: i,
      restName: `店${i}`,
      lastSeen: '2026-10-01T00:00:00.000Z',
    });
    vi.mocked(adminApi.suspiciousMulti).mockResolvedValue([
      { kind: 'ip', key: '10.0.0.1', total: 2, accounts: [acct(1), acct(2)] },
      { kind: 'device', key: 'dev-x', total: 2, accounts: [acct(3), acct(4)] },
    ]);
  });

  it('只列这个号所在的组；点“看全部”恢复', async () => {
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'mod' };
    useAdminStore().shardId = 1;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
    });
    const w = mount(AdminSuspiciousView, {
      global: {
        plugins: [router],
        stubs: {
          RhythmPanel: {
            emits: ['multi'],
            template: `<button data-testid="rp-multi" @click="$emit('multi', 2)" />`,
          },
        },
      },
    });
    await flushPromises();
    await w.find('[data-testid="sus-tab-rhythm"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="rp-multi"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('同一 IP：10.0.0.1');
    expect(w.text()).not.toContain('dev-x');
    await w.find('[data-testid="sus-multi-all"]').trigger('click');
    expect(w.text()).toContain('dev-x');
  });
});

describe('backlog 6B-2：可疑数据页切换区服和加载中', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });
  const rowOf = (restId: number) => ({
    ...who,
    restId,
    perfectSum: 1,
    perfectMax: 1,
    bullSum: 0,
    bullMax: 0,
    flagged: false,
  });

  it('快速切换区服：先发出的慢请求后回来，不会覆盖新区服的数据', async () => {
    let slow: (v: ReturnType<typeof rowOf>[]) => void = () => {};
    vi.mocked(adminApi.suspiciousBar)
      .mockImplementationOnce(() => new Promise((r) => (slow = r)))
      .mockResolvedValueOnce([rowOf(2)]);
    const w = await mountView();
    useAdminStore().shardId = 2;
    await flushPromises();
    slow([rowOf(1)]);
    await flushPromises();
    expect(w.find('[data-testid="sus-bar-2"]').exists()).toBe(true);
    expect(w.find('[data-testid="sus-bar-1"]').exists()).toBe(false);
  });

  it('加载中显示"加载中"，不显示"没有数据"', async () => {
    vi.mocked(adminApi.suspiciousBar).mockImplementation(() => new Promise(() => {}));
    const w = await mountView();
    expect(w.text()).toContain('加载中');
    expect(w.text()).not.toContain('没有数据');
  });
});

describe('backlog 6B-2：多号分组只列一部分账号时写明总数', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });
  it('一共 80 个账号、只列了 2 个：写"共 80 个账号，只列最近 2 个"', async () => {
    vi.mocked(adminApi.suspiciousBar).mockResolvedValue([]);
    vi.mocked(adminApi.suspiciousMulti).mockResolvedValue([
      {
        kind: 'device',
        key: 'dev-x',
        total: 80,
        accounts: [1, 2].map((i) => ({
          accountId: i,
          username: `u${i}`,
          restId: null,
          restName: null,
          lastSeen: '2026-10-01T00:00:00.000Z',
        })),
      },
    ]);
    const w = await mountView();
    await w.find('[data-testid="sus-tab-multi"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('共 80 个账号，只列最近 2 个');
  });

  it('收购拦截（收购 PR 3）：时间、买家、目标店、原因、关联账号，链到这几个玩家', async () => {
    vi.mocked(adminApi.suspiciousAcquire).mockResolvedValue([
      {
        at: '2026-10-06T04:00:00.000Z',
        reason: 'device',
        buyer: { restId: 3, name: '买家店', accountId: 9 },
        target: { restId: 4, name: '目标店', accountId: 10 },
        // 关联上的是目标店的老板（收购 PR 3 遗留）
        linked: { accountId: 11, username: 'boss' },
      },
    ]);
    const w = await mountView();
    await w.get('[data-testid="sus-tab-acquire"]').trigger('click');
    await flushPromises();
    expect(adminApi.suspiciousAcquire).toHaveBeenCalledWith(1);
    const row = w.get('[data-testid="sus-acquire-0"]');
    expect(row.text()).toContain('买家店');
    expect(row.text()).toContain('目标店');
    expect(row.text()).toContain('共用设备');
    expect(row.findAll('a').map((a) => a.attributes('href'))).toEqual([
      '/admin/players/9',
      '/admin/players/10',
      '/admin/players/11',
    ]);
    expect(row.text()).toContain('boss');
  });

  it('封禁名单（2026-10-16）：多号里点“封禁…”切到封禁名单、填好 IP；确认后封禁并一并封号；协管看不到封禁按钮', async () => {
    vi.mocked(adminApi.accessBans).mockResolvedValue([]);
    vi.mocked(adminApi.suspiciousMulti).mockResolvedValue([
      {
        kind: 'ip',
        key: '10.0.0.1',
        total: 1,
        accounts: [
          { accountId: 1, username: 'u1', restId: 1, restName: '店1', lastSeen: '2026-10-01T00:00:00.000Z' },
        ],
      },
    ]);
    vi.mocked(adminApi.addAccessBan).mockResolvedValue({
      ban: {
        id: 1,
        kind: 'ip',
        value: '10.0.0.1',
        reason: '刷号',
        actor: 'boss',
        createdAt: '2026-10-16T00:00:00.000Z',
        accounts: 3,
      },
      bannedAccounts: [1, 2, 3],
    });
    const modView = await mountView();
    await modView.find('[data-testid="sus-tab-multi"]').trigger('click');
    await flushPromises();
    expect(modView.find('[data-testid="sus-multi-ban-ip-10.0.0.1"]').exists()).toBe(false);
    modView.unmount();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountView('admin');
    await w.find('[data-testid="sus-tab-multi"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="sus-multi-ban-ip-10.0.0.1"]').trigger('click');
    await flushPromises();
    expect((w.find('[data-testid="ban-value"]').element as HTMLInputElement).value).toBe('10.0.0.1');
    await w.find('[data-testid="ban-reason"]').setValue('刷号');
    await w.find('[data-testid="ban-add"]').trigger('click');
    await flushPromises();
    expect(adminApi.addAccessBan).toHaveBeenCalledWith({
      kind: 'ip',
      value: '10.0.0.1',
      reason: '刷号',
      banAccounts: true,
    });
    expect(adminApi.accessBans).toHaveBeenCalledTimes(2);
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { RhythmRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import RhythmPanel from './RhythmPanel.vue';

vi.mock('../../api/admin', () => ({
  adminApi: { suspiciousRhythm: vi.fn(), antibotWhitelist: vi.fn(), antibotUnwhitelist: vi.fn() },
}));

const row = (p: Partial<RhythmRow>): RhythmRow => ({
  accountId: 1,
  username: 'u',
  restId: 1,
  restName: '店',
  whitelisted: false,
  score: 10,
  days: 1,
  activeHoursPerDay: 3,
  longestStreakHours: 2,
  nightPosts: 0,
  posts: 30,
  bursts: 0,
  gapCv: null,
  noViewShare: 0,
  idleShare: 0,
  verdicts: { ok: 30 },
  uas: 1,
  devices: 1,
  lastDevice: 'dev-12345678',
  lastIp: '10.0.0.1',
  ...p,
});

async function mountPanel(role: 'mod' | 'admin') {
  useAdminStore().me = { accountId: 99, username: 'boss', role };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
  });
  const w = mount(RhythmPanel, { props: { shardId: 1 }, global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('RhythmPanel（防脚本 2026-10-25）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.suspiciousRhythm).mockResolvedValue({
      rows: [
        row({ accountId: 7, username: 'bot', score: 92, verdicts: { ok: 10, missing: 3 } }),
        row({ accountId: 8, username: 'me', whitelisted: true }),
      ],
      whitelist: [{ accountId: 8, username: 'me', note: '自己的号', at: '2026-10-25T00:00:00.000Z' }],
    });
  });

  it('列出两行、写出打分规则、只显示不通过的签名结论', async () => {
    const w = await mountPanel('mod');
    expect(w.findAll('[data-testid="rhythm-row"]')).toHaveLength(2);
    expect(w.text()).toContain('40 × min(每天有操作的小时数 ÷ 20, 1)');
    expect(w.text()).toContain('missing 3');
    expect(w.text()).not.toContain('ok 10');
  });

  it('管理员：白名单行有“移出白名单”，别的行有“加白名单”；协管看不到这两个按钮', async () => {
    const w = await mountPanel('admin');
    expect(w.find('[data-testid="rhythm-unwhite-8"]').exists()).toBe(true);
    expect(w.find('[data-testid="rhythm-white-7"]').exists()).toBe(true);
    const m = await mountPanel('mod');
    expect(m.find('[data-testid="rhythm-white-7"]').exists()).toBe(false);
  });

  it('点“去封禁”把最近的设备号交给上层', async () => {
    const w = await mountPanel('mod');
    await w.find('[data-testid="rhythm-ban-7"]').trigger('click');
    expect(w.emitted('ban')![0]).toEqual([{ kind: 'device', value: 'dev-12345678' }]);
  });
});

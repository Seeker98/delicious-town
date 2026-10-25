import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { RhythmRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import RhythmPanel from './RhythmPanel.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    suspiciousRhythm: vi.fn(),
    antibotWhitelist: vi.fn(),
    antibotUnwhitelist: vi.fn(),
    antibotChallenge: vi.fn(),
    antibotUnchallenge: vi.fn(),
  },
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
  ips: 1,
  lastDevice: 'dev-12345678',
  lastIp: '10.0.0.1',
  challengeUntil: null,
  client: 'normal',
  unsignedShare: 0,
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
      challenges: [],
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

  it('白名单单独列出来（不管在不在节奏列表里），每个都能移出；管理员能按账号编号加入', async () => {
    vi.mocked(adminApi.suspiciousRhythm).mockResolvedValue({
      rows: [],
      whitelist: [{ accountId: 42, username: 'quiet', note: 'AI 工具', at: '2026-10-25T00:00:00.000Z' }],
      challenges: [],
    });
    vi.mocked(adminApi.antibotUnwhitelist).mockResolvedValue({ ok: true });
    vi.mocked(adminApi.antibotWhitelist).mockResolvedValue({ ok: true });
    const w = await mountPanel('admin');
    expect(w.text()).toContain('quiet');
    await w.find('[data-testid="rhythm-wl-remove-42"]').trigger('click');
    await flushPromises();
    expect(adminApi.antibotUnwhitelist).toHaveBeenCalledWith({ accountId: 42 });
    await w.find('[data-testid="rhythm-wl-id"]').setValue('77');
    await w.find('[data-testid="rhythm-wl-note"]').setValue('自己的号');
    await w.find('[data-testid="rhythm-wl-add"]').trigger('click');
    await flushPromises();
    expect(adminApi.antibotWhitelist).toHaveBeenCalledWith({ accountId: 77, note: '自己的号' });
  });

  it('人机验证：名单单独列出、能取消；按钮问天数，只认 1/3/7', async () => {
    vi.mocked(adminApi.suspiciousRhythm).mockResolvedValue({
      rows: [row({ accountId: 7, username: 'bot' })],
      whitelist: [],
      challenges: [{ accountId: 9, username: 'sus', note: '像脚本', until: '2026-10-28T00:00:00.000Z' }],
    });
    vi.mocked(adminApi.antibotChallenge).mockResolvedValue({ ok: true });
    vi.mocked(adminApi.antibotUnchallenge).mockResolvedValue({ ok: true });
    const w = await mountPanel('admin');
    expect(w.text()).toContain('sus');
    await w.find('[data-testid="rhythm-ch-remove-9"]').trigger('click');
    await flushPromises();
    expect(adminApi.antibotUnchallenge).toHaveBeenCalledWith({ accountId: 9 });
    const prompt = vi
      .spyOn(window, 'prompt')
      .mockReturnValueOnce('2')
      .mockReturnValueOnce('3')
      .mockReturnValueOnce(' 像脚本 ');
    await w.find('[data-testid="rhythm-challenge-7"]').trigger('click');
    await flushPromises();
    expect(adminApi.antibotChallenge).not.toHaveBeenCalled();
    await w.find('[data-testid="rhythm-challenge-7"]').trigger('click');
    await flushPromises();
    expect(adminApi.antibotChallenge).toHaveBeenCalledWith({ accountId: 7, days: 3, note: '像脚本' });
    prompt.mockRestore();
  });

  it('人机验证：备注那一步点取消就不提交', async () => {
    vi.mocked(adminApi.suspiciousRhythm).mockResolvedValue({
      rows: [row({ accountId: 7, username: 'bot' })],
      whitelist: [],
      challenges: [],
    });
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('1').mockReturnValueOnce(null);
    const w = await mountPanel('admin');
    await w.find('[data-testid="rhythm-challenge-7"]').trigger('click');
    await flushPromises();
    expect(adminApi.antibotChallenge).not.toHaveBeenCalled();
    prompt.mockRestore();
  });

  it('白名单里的号被点名：两处都提示验证不生效', async () => {
    vi.mocked(adminApi.suspiciousRhythm).mockResolvedValue({
      rows: [
        row({ accountId: 8, username: 'me', whitelisted: true, challengeUntil: '2026-10-28T00:00:00.000Z' }),
      ],
      whitelist: [{ accountId: 8, username: 'me', note: '', at: '2026-10-25T00:00:00.000Z' }],
      challenges: [{ accountId: 8, username: 'me', note: '', until: '2026-10-28T00:00:00.000Z' }],
    });
    const w = await mountPanel('admin');
    expect(w.findAll('[data-testid="rhythm-wl-moot"]')).toHaveLength(2);
  });

  it('写出 IP 数、人机验证结果、读请求没带版本号；验证结果不混进签名没通过', async () => {
    vi.mocked(adminApi.suspiciousRhythm).mockResolvedValue({
      rows: [
        row({
          accountId: 7,
          username: 'bot',
          uas: 2,
          devices: 3,
          ips: 4,
          verdicts: { ok: 5, get_no_build: 6, captcha_ok: 1, captcha_missing: 2, captcha_failed: 3 },
        }),
      ],
      whitelist: [],
      challenges: [],
    });
    const w = await mountPanel('mod');
    const text = w.find('[data-testid="rhythm-row"]').text();
    expect(text).toContain('2 / 3 / 4');
    expect(text).toContain('读请求没版本号 6');
    expect(w.find('[data-testid="rhythm-captcha-7"]').text()).toBe('过 1 · 没带 2 · 没过 3');
    expect(text).not.toContain('captcha_');
  });

  it('点“看多号”把账号交给上层', async () => {
    const w = await mountPanel('mod');
    await w.find('[data-testid="rhythm-multi-7"]').trigger('click');
    expect(w.emitted('multi')![0]).toEqual([7]);
  });

  it('客户端分类（安全审计 D1）：裸接口写出没签名的比例并标红，正常的不写', async () => {
    vi.mocked(adminApi.suspiciousRhythm).mockResolvedValue({
      rows: [
        row({ accountId: 7, username: 'bot', score: 5, client: 'bare', unsignedShare: 0.95 }),
        row({ accountId: 8, username: 'head', client: 'idle' }),
        row({ accountId: 9, username: 'me' }),
      ],
      whitelist: [],
      challenges: [],
    });
    const w = await mountPanel('mod');
    const rows = w.findAll('[data-testid="rhythm-row"]');
    expect(w.find('[data-testid="rhythm-client-7"]').text()).toBe('裸接口 (没签名 95%)');
    expect(rows[0]!.classes()).toContain('is-bad');
    expect(w.find('[data-testid="rhythm-client-8"]').text()).toBe('多半没有真人点击');
    expect(w.find('[data-testid="rhythm-client-9"]').text()).toBe('–');
    expect(w.text()).toContain('裸接口: 写请求八成以上没签名');
  });
});

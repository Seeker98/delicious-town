import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PredictAdminRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminPredictView from './AdminPredictView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: { predictList: vi.fn(), predictCreate: vi.fn(), predictResolve: vi.fn(), predictVoid: vi.fn() },
}));

const row: PredictAdminRow = {
  id: 7,
  title: '明天会下雨吗',
  status: 'closed',
  outcome: null,
  closeAt: '2026-10-03T12:00:00.000Z',
  price: 0.63,
  trades: 12,
  holders: 5,
  fees: 820,
  ifYes: -15000,
  ifNo: 23000,
  creator: 'boss',
  auto: false,
  resultNote: null,
};

async function mountAs(role: 'mod' | 'admin') {
  useAdminStore().me = { accountId: 1, username: 'boss', role };
  useAdminStore().shardId = 3;
  const w = mount(AdminPredictView);
  await flushPromises();
  return w;
}

describe('后台预测页（238-1 设计 §7.3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.predictList).mockResolvedValue([row]);
    vi.mocked(adminApi.predictCreate).mockResolvedValue({ id: 8 });
    vi.mocked(adminApi.predictResolve).mockResolvedValue({ ok: true });
    vi.mocked(adminApi.predictVoid).mockResolvedValue({ ok: true });
    // 判定、作废改用输入框确认，可以顺便填备注（backlog 238-1）
    vi.spyOn(window, 'prompt').mockReturnValue('');
  });

  it('按区服读取；显示概率、成交、系统收支', async () => {
    const w = await mountAs('mod');
    expect(adminApi.predictList).toHaveBeenCalledWith(3);
    const t = w.get('[data-testid="apd-row-7"]').text();
    expect(t).toContain('明天会下雨吗');
    expect(t).toContain('63%');
    expect(t).toContain('-15,000');
    expect(t).toContain('23,000');
  });

  it('协管看不到判定和作废按钮；管理员能判定', async () => {
    const m = await mountAs('mod');
    expect(m.find('[data-testid="apd-yes-7"]').exists()).toBe(false);
    const a = await mountAs('admin');
    await a.get('[data-testid="apd-yes-7"]').trigger('click');
    await flushPromises();
    expect(adminApi.predictResolve).toHaveBeenCalledWith(7, true, '');
    expect(adminApi.predictList).toHaveBeenCalledTimes(3);
  });

  it('判定、作废可以填备注；取消就不提交（backlog 238-1）', async () => {
    const a = await mountAs('admin');
    vi.mocked(window.prompt).mockReturnValueOnce(null);
    await a.get('[data-testid="apd-yes-7"]').trigger('click');
    await flushPromises();
    expect(adminApi.predictResolve).not.toHaveBeenCalled();
    vi.mocked(window.prompt).mockReturnValueOnce(' 官方公告已发布 ');
    await a.get('[data-testid="apd-yes-7"]').trigger('click');
    await flushPromises();
    expect(adminApi.predictResolve).toHaveBeenCalledWith(7, true, '官方公告已发布');
    vi.mocked(window.prompt).mockReturnValueOnce('题目有歧义');
    await a.get('[data-testid="apd-void-7"]').trigger('click');
    await flushPromises();
    expect(adminApi.predictVoid).toHaveBeenCalledWith(7, '题目有歧义');
  });

  it('系统出的题出题人显示"系统"，显示判定依据', async () => {
    vi.mocked(adminApi.predictList).mockResolvedValue([
      {
        ...row,
        auto: true,
        creator: null,
        status: 'resolved',
        outcome: true,
        resultNote: '明天 9 点蟹老板刷新在 7 号街',
      },
    ]);
    const w = await mountAs('mod');
    const t = w.get('[data-testid="apd-row-7"]').text();
    expect(t).toContain('系统');
    expect(w.get('[data-testid="apd-note-7"]').text()).toContain('明天 9 点蟹老板刷新在 7 号街');
  });

  it('出题：提交区服、标题、截止时间、初始概率', async () => {
    const w = await mountAs('mod');
    await w.get('[data-testid="apd-title"]').setValue('蟹老板明天在 1~6 号街吗');
    await w.get('[data-testid="apd-close"]').setValue('2026-10-03T12:00');
    await w.get('[data-testid="apd-p0"]').setValue('40');
    await w.get('[data-testid="apd-create"]').trigger('click');
    await flushPromises();
    expect(adminApi.predictCreate).toHaveBeenCalledWith({
      shardId: 3,
      title: '蟹老板明天在 1~6 号街吗',
      description: '',
      closeAt: '2026-10-03T04:00:00.000Z', // 北京时间 12:00
      p0: 40,
    });
  });
});

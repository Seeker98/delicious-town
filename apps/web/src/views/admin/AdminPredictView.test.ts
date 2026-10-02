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
    vi.spyOn(window, 'confirm').mockReturnValue(true);
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
    expect(adminApi.predictResolve).toHaveBeenCalledWith(7, true);
    expect(adminApi.predictList).toHaveBeenCalledTimes(3);
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
      closeAt: new Date('2026-10-03T12:00').toISOString(),
      p0: 40,
    });
  });
});

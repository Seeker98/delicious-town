import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LaunchCheckDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import LaunchCheck from './LaunchCheck.vue';

vi.mock('../../api/admin', () => ({ adminApi: { launchCheck: vi.fn(), launchCheckFix: vi.fn() } }));

const failing: LaunchCheckDto = {
  allOk: false,
  shards: [
    {
      shardId: 3,
      shardName: '三服',
      version: 4,
      items: [
        {
          path: 'tuning.hiphop.requireVerifiedEmail',
          want: true,
          current: false,
          ok: false,
          why: '防止小号刷嘻哈奖励',
        },
        { path: 'tuning.friend.requireVerifiedEmail', want: true, current: true, ok: true, why: '好友互动' },
      ],
    },
  ],
};
const passing: LaunchCheckDto = {
  allOk: true,
  shards: [
    { ...failing.shards[0]!, version: 5, items: failing.shards[0]!.items.map((i) => ({ ...i, ok: true })) },
  ],
};

async function mountAs(role: 'mod' | 'admin') {
  useAdminStore().me = { accountId: 1, username: 'boss', role };
  const w = mount(LaunchCheck);
  await flushPromises();
  return w;
}

describe('LaunchCheck（子项目 6B-2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.launchCheck).mockResolvedValue(failing);
    vi.mocked(adminApi.launchCheckFix).mockResolvedValue(passing);
  });

  it('列出没通过的项；协管看不到修复按钮', async () => {
    const w = await mountAs('mod');
    expect(w.text()).toContain('三服');
    expect(w.text()).toContain('tuning.hiphop.requireVerifiedEmail');
    expect(w.text()).toContain('防止小号刷嘻哈奖励');
    expect(w.text()).not.toContain('tuning.friend.requireVerifiedEmail');
    expect(w.find('[data-testid="launch-fix-3"]').exists()).toBe(false);
  });

  it('管理员确认后修复，刷新后显示全部通过', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountAs('admin');
    await w.find('[data-testid="launch-fix-3"]').trigger('click');
    await flushPromises();
    expect(ask.mock.calls[0]![0]).toContain('1 项');
    expect(adminApi.launchCheckFix).toHaveBeenCalledWith({ shardId: 3, version: 4 });
    expect(w.find('[data-testid="launch-ok"]').exists()).toBe(true);
  });
});

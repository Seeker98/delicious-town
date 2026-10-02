import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import ActivityBanner from './ActivityBanner.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { activitySummary: vi.fn() } }));
const opts = { global: { stubs: { RouterLink: RouterLinkStub } } };

describe('ActivityBanner', () => {
  beforeEach(() => vi.clearAllMocks());
  it('有进行中的活动时显示个数和可领份数', async () => {
    vi.mocked(endpoints.activitySummary).mockResolvedValue({ running: 2, claimable: 3 });
    const w = mount(ActivityBanner, opts);
    await flushPromises();
    expect(w.text()).toContain('限时活动 2 个进行中');
    expect(w.text()).toContain('可领 3 份');
  });
  it('没有活动或接口报错（功能关闭）时不显示', async () => {
    vi.mocked(endpoints.activitySummary).mockResolvedValue({ running: 0, claimable: 0 });
    expect(mount(ActivityBanner, opts).html()).not.toContain('进行中');
    vi.mocked(endpoints.activitySummary).mockRejectedValue(new Error('FEATURE_DISABLED'));
    const w = mount(ActivityBanner, opts);
    await flushPromises();
    expect(w.text()).toBe('');
  });
});

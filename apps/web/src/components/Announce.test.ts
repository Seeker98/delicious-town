import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnouncementDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import AnnounceBanner from './AnnounceBanner.vue';
import AnnouncePopup from './AnnouncePopup.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { announcements: vi.fn(), announcementSeen: vi.fn() },
}));

const a = (patch: Partial<AnnouncementDto> = {}): AnnouncementDto => ({
  id: 1,
  title: '停服维护',
  body: '今晚 2 点\n预计 1 小时',
  important: false,
  startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: '2026-10-02T00:00:00.000Z',
  seen: true,
  ...patch,
});

describe('公告', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.announcementSeen).mockResolvedValue(undefined as never);
  });

  it('横幅显示第一条标题，点开看全部；没有公告不渲染', async () => {
    const w = mount(AnnounceBanner, { props: { items: [a(), a({ id: 2, title: '开服活动' })] } });
    expect(w.find('[data-testid="announce-banner"]').text()).toContain('停服维护');
    await w.find('[data-testid="announce-banner"]').trigger('click');
    expect(w.text()).toContain('开服活动');
    expect(w.text()).toContain('今晚 2 点');
    expect(
      mount(AnnounceBanner, { props: { items: [] } })
        .find('[data-testid="announce-banner"]')
        .exists(),
    ).toBe(false);
  });

  it('未看的重要公告逐条弹出，关掉一条记已看再弹下一条；看过的不弹', async () => {
    vi.mocked(endpoints.announcements).mockResolvedValue({
      items: [
        a({ id: 1, important: true, seen: false, title: '一' }),
        a({ id: 2, important: true, seen: false, title: '二' }),
        a({ id: 3, important: true, seen: true, title: '三' }),
      ],
    });
    const w = mount(AnnouncePopup);
    await flushPromises();
    expect(w.find('[data-testid="announce-popup"]').text()).toContain('一');
    await w.find('[data-testid="announce-close"]').trigger('click');
    await flushPromises();
    expect(endpoints.announcementSeen).toHaveBeenCalledWith(1);
    expect(w.find('[data-testid="announce-popup"]').text()).toContain('二');
    await w.find('[data-testid="announce-close"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="announce-popup"]').exists()).toBe(false);
  });
});

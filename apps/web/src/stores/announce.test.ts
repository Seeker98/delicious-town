import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnouncementDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useAnnounceStore } from './announce';

vi.mock('../api/endpoints', () => ({ endpoints: { announcements: vi.fn() } }));

const item = (id: number): AnnouncementDto =>
  ({ id, title: `t${id}`, body: '', important: true, seen: false }) as unknown as AnnouncementDto;

describe('公告列表共用一次请求（性能 2026-10-31：首页横幅和重要公告弹窗原来各读一次）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.mocked(endpoints.announcements).mockResolvedValue({ items: [item(1)] } as never);
  });
  afterEach(() => vi.useRealTimers());

  it('同时要：一个请求；一分钟内再要用读过的；过了一分钟重读', async () => {
    const s = useAnnounceStore();
    const [a, b] = await Promise.all([s.load(), s.load()]);
    expect(a).toEqual([item(1)]);
    expect(b).toBe(a);
    expect(endpoints.announcements).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(59_000);
    await s.load();
    expect(endpoints.announcements).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await s.load();
    expect(endpoints.announcements).toHaveBeenCalledTimes(2);
  });

  it('读失败：报给调用的，下次照常读', async () => {
    vi.mocked(endpoints.announcements).mockRejectedValueOnce(new Error('x'));
    const s = useAnnounceStore();
    await expect(s.load()).rejects.toThrow('x');
    expect(await s.load()).toEqual([item(1)]);
    expect(endpoints.announcements).toHaveBeenCalledTimes(2);
  });

  it('弹窗关掉一条：记着的也改成已看，一分钟内重新挂载不再弹', async () => {
    const s = useAnnounceStore();
    await s.load();
    s.markSeen(1);
    expect((await s.load())[0]!.seen).toBe(true);
  });
});

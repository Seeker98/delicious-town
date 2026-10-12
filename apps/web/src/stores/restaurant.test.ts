import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useRestaurantStore } from './restaurant';

vi.mock('../api/endpoints', () => ({ endpoints: { overview: vi.fn() } }));

describe('餐厅数据同时读只发一个请求（backlog P2a）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('进页面时顶栏和首页同时 load：共用一个请求；读完后再 load 会重新读', async () => {
    let n = 0;
    vi.mocked(endpoints.overview).mockImplementation(async () => ({ id: ++n }) as unknown as RestaurantDto);
    const s = useRestaurantStore();
    const [a, b] = await Promise.all([s.load(), s.load()]);
    expect(endpoints.overview).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(s.rest?.id).toBe(1);
    await s.load();
    expect(endpoints.overview).toHaveBeenCalledTimes(2);
    expect(s.rest?.id).toBe(2);
  });

  it('操作完 refresh 总是新发一个请求，不拿操作之前发出的那个', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({ id: 1 } as unknown as RestaurantDto);
    const s = useRestaurantStore();
    const first = s.load();
    await s.refresh();
    await first;
    expect(endpoints.overview).toHaveBeenCalledTimes(2);
  });

  it('新建 pinia 后不会拿到上一个实例没读完的请求', async () => {
    vi.mocked(endpoints.overview).mockReturnValueOnce(new Promise(() => {}));
    void useRestaurantStore().load();
    setActivePinia(createPinia());
    vi.mocked(endpoints.overview).mockResolvedValue({ id: 7 } as unknown as RestaurantDto);
    expect((await useRestaurantStore().load()).id).toBe(7);
  });
});

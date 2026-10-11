import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShardDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useShardsStore } from './shards';

vi.mock('../api/endpoints', () => ({ endpoints: { listShards: vi.fn() } }));

const shard = (id: number, name: string): ShardDto => ({
  id,
  name,
  status: 'open',
  openedAt: '2026-01-01T00:00:00Z',
  hasRestaurant: false,
  rest: null,
});

describe('区服列表（界面改版 P11）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.listShards).mockReset();
  });

  it('nameOf：按编号写区服名；没读过、找不到、没有编号都写空', async () => {
    const s = useShardsStore();
    expect(s.nameOf(1)).toBe('');
    vi.mocked(endpoints.listShards).mockResolvedValue([shard(1, '一服'), shard(2, '二服')]);
    await s.load();
    expect(s.nameOf(2)).toBe('二服');
    expect(s.nameOf(9)).toBe('');
    expect(s.nameOf(null)).toBe('');
    expect(s.nameOf(undefined)).toBe('');
  });

  it('load 只在没读过时读一次；refresh 每次都重读', async () => {
    vi.mocked(endpoints.listShards).mockResolvedValue([shard(1, '一服')]);
    const s = useShardsStore();
    await s.load();
    await s.load();
    expect(endpoints.listShards).toHaveBeenCalledTimes(1);
    vi.mocked(endpoints.listShards).mockResolvedValue([shard(1, '新名字')]);
    expect(await s.refresh()).toEqual([shard(1, '新名字')]);
    expect(endpoints.listShards).toHaveBeenCalledTimes(2);
    expect(s.nameOf(1)).toBe('新名字');
  });

  it('load 读失败不报错（只是区服名不显示），下次再读', async () => {
    vi.mocked(endpoints.listShards).mockRejectedValue(new Error('net'));
    const s = useShardsStore();
    await expect(s.load()).resolves.toBeUndefined();
    expect(s.list).toBeNull();
    expect(s.nameOf(1)).toBe('');
    vi.mocked(endpoints.listShards).mockResolvedValue([shard(1, '一服')]);
    await s.load();
    expect(s.nameOf(1)).toBe('一服');
  });

  it('refresh 读失败照常抛出，交给切换区服页写错误', async () => {
    vi.mocked(endpoints.listShards).mockRejectedValue(new Error('net'));
    await expect(useShardsStore().refresh()).rejects.toThrow('net');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { resetTitleList, useTitleList } from './titleList';

vi.mock('../../api/admin', () => ({ adminApi: { titles: vi.fn() } }));

describe('后台选称号的共用列表', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTitleList();
  });

  it('读失败后下次会重新读，不会一直卡在失败', async () => {
    vi.mocked(adminApi.titles).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce([]);
    await expect(useTitleList().load()).rejects.toThrow('net');
    await useTitleList().load();
    expect(adminApi.titles).toHaveBeenCalledTimes(2);
  });
});

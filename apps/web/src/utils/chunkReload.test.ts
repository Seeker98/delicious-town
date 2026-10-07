import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, reloadOnce } from './chunkReload';

describe('发版后页面文件加载不到时自动刷新一次（问题记录 497）', () => {
  beforeEach(() => sessionStorage.clear());

  it('认得出浏览器加载分包失败的几种报错', () => {
    expect(
      isChunkLoadError(
        new TypeError(
          'Failed to fetch dynamically imported module: https://game.delicious.trade/assets/RestaurantHomeView-BZrNwFV5.js',
        ),
      ),
    ).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
    expect(isChunkLoadError(new Error('Network Error'))).toBe(false);
    expect(isChunkLoadError('oops')).toBe(false);
  });

  it('刷新一次，转到要去的页面；10 秒内又失败就不再刷，免得新版本真坏了时一直刷', () => {
    const go = vi.fn();
    expect(reloadOnce('/rest/tasks', go, 1_000_000)).toBe(true);
    expect(go).toHaveBeenCalledWith('/rest/tasks');
    expect(reloadOnce('/rest/tasks', go, 1_005_000)).toBe(false);
    expect(go).toHaveBeenCalledTimes(1);
    // 过了 10 秒又碰到（比如又发了一版），可以再刷
    expect(reloadOnce('/', go, 1_011_000)).toBe(true);
    expect(go).toHaveBeenCalledTimes(2);
  });

  it('存储不可用时也能刷（只是不防连刷）', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const go = vi.fn();
    expect(reloadOnce('/', go, 1)).toBe(true);
    spy.mockRestore();
  });
});

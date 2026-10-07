import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { chunkTarget, installChunkReload, isChunkLoadError, reloadOnce } from './chunkReload';

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

  it('点链接去的页面加载失败：刷新到要去的页面，不是当前页面（终审：Vite 的预加载报错先到，那时地址还没变）', async () => {
    const go = vi.fn();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        {
          path: '/rest/tasks',
          component: () =>
            Promise.reject(
              new TypeError('Failed to fetch dynamically imported module: /assets/RestTasksView-x.js'),
            ),
        },
      ],
    });
    installChunkReload(router, go);
    await router.push('/');
    // 预加载报错发生在导航进行中：这时要去的页面已经记下
    let during: string | null = null;
    router.beforeEach(() => {
      during = chunkTarget();
    });
    await router.push('/rest/tasks?tab=main').catch(() => undefined);
    expect(during).toBe('/rest/tasks?tab=main');
    expect(go).toHaveBeenCalledWith('/rest/tasks?tab=main');
    // 导航结束（失败）后不再记着
    expect(chunkTarget()).toBeNull();
  });

  it('别的导航错误照常打到控制台，不刷新', async () => {
    const go = vi.fn();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/bad', component: () => Promise.reject(new Error('boom')) },
      ],
    });
    installChunkReload(router, go);
    await router.push('/');
    await router.push('/bad').catch(() => undefined);
    expect(go).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

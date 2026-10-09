import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import {
  bustThenGo,
  chunkTarget,
  goOrReload,
  installChunkReload,
  isChunkLoadError,
  reloadOnce,
} from './chunkReload';

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

  it('断网时不刷：加载失败是因为没网，刷了只会落到浏览器的离线页（495~513 遗留）', () => {
    const go = vi.fn();
    expect(reloadOnce('/rest/tasks', go, 2_000_000, false)).toBe(false);
    expect(go).not.toHaveBeenCalled();
    // 没占掉 10 秒的窗口：网回来后照样能刷
    expect(reloadOnce('/rest/tasks', go, 2_001_000, true)).toBe(true);
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
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith('/rest/tasks?tab=main'));
    // 导航结束（失败）后不再记着
    expect(chunkTarget()).toBeNull();
  });

  it('刷新前先强制重拉加载失败的那个文件（稳健性批：/assets 缓存一年，回滚时 SPA 兜底回的 index.html 会被当成这个 JS 缓存住）', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''));
    const go = vi.fn();
    const err = new TypeError(
      'Failed to fetch dynamically imported module: https://game.delicious.trade/assets/RestTasksView-x.js',
    );
    expect(reloadOnce('/rest/tasks', bustThenGo(err, go), 3_000_000)).toBe(true);
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith('/rest/tasks'));
    expect(fetchSpy).toHaveBeenCalledWith('https://game.delicious.trade/assets/RestTasksView-x.js', {
      cache: 'reload',
    });
    // CSS 的预加载报错是相对地址
    fetchSpy.mockClear();
    const go2 = vi.fn();
    bustThenGo(new Error('Unable to preload CSS for /assets/x-1.css'), go2)('/');
    await vi.waitFor(() => expect(go2).toHaveBeenCalledWith('/'));
    expect(fetchSpy).toHaveBeenCalledWith('/assets/x-1.css', { cache: 'reload' });
    fetchSpy.mockRestore();
  });

  it('重拉要读完响应体（终审：只等到响应头就跳页，缓存可能只写了一半）；真正刷新时再记一次时间，10 秒窗口从刷新时算（终审）', async () => {
    const body = vi.fn(async () => new ArrayBuffer(0));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ arrayBuffer: body } as never);
    const go = vi.fn();
    expect(
      reloadOnce('/x', bustThenGo(new Error('Unable to preload CSS for /assets/y.css'), go), 5_000_000),
    ).toBe(true);
    await vi.waitFor(() => expect(go).toHaveBeenCalled());
    expect(body).toHaveBeenCalled();
    expect(Number(sessionStorage.getItem('dt_chunk_reload_at'))).toBeGreaterThan(5_000_000);
    fetchSpy.mockRestore();
  });

  it('断网时点到没加载过的页面：不刷新，提示网络断了（稳健性批：原来点了没反应）', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const go = vi.fn();
    const offline = vi.fn();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        {
          path: '/mail',
          component: () =>
            Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/Mail.js')),
        },
      ],
    });
    installChunkReload(router, go, offline);
    await router.push('/');
    await router.push('/mail').catch(() => undefined);
    expect(offline).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    online.mockRestore();
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

describe('刷新时不丢前进记录（backlog：后退、前进时加载失败，刷新会清掉前进记录）', () => {
  it('地址栏已经是要去的页面：原地刷新；不是：转过去', () => {
    const loc = { pathname: '/rest/tasks', search: '?tab=a', hash: '', assign: vi.fn(), reload: vi.fn() };
    goOrReload(loc)('/rest/tasks?tab=a');
    expect(loc.reload).toHaveBeenCalledTimes(1);
    expect(loc.assign).not.toHaveBeenCalled();
    goOrReload(loc)('/town');
    expect(loc.assign).toHaveBeenCalledWith('/town');
  });
});

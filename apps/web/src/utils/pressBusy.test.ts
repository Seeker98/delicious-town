import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../api/client';
import { installPressBusy, resetPressBusy } from './pressBusy';

/** 回应先挂着，手动放行：看请求途中按钮的样子 */
function pendingFetch() {
  let release: () => void = () => {};
  const f = vi.fn(
    () =>
      new Promise<Response>((r) => {
        release = () => r(new Response(JSON.stringify({ ok: true, data: 1, events: [] })));
      }),
  );
  return { f, release: () => release() };
}

describe('按钮“处理中”（界面第二批）', () => {
  let uninstall = () => {};
  afterEach(() => {
    uninstall();
    resetPressBusy();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('点了按钮随后发写请求：请求途中按钮标 aria-busy，回来后去掉', async () => {
    uninstall = installPressBusy();
    document.body.innerHTML = '<button class="btn"><span>买</span></button>';
    const btn = document.querySelector('button')!;
    btn.querySelector('span')!.click();
    const { f, release } = pendingFetch();
    const done = createApiClient(f, '').post('/buy');
    expect(btn.getAttribute('aria-busy')).toBe('true');
    release();
    await done;
    expect(btn.hasAttribute('aria-busy')).toBe(false);
  });

  it('读请求、不是 .btn 的按钮、点完超过 1 秒才发的请求都不标', async () => {
    uninstall = installPressBusy();
    document.body.innerHTML = '<button class="btn" id="a">a</button><button id="b">b</button>';
    const a = document.getElementById('a')!;
    const b = document.getElementById('b')!;
    const api = createApiClient(
      async () => new Response(JSON.stringify({ ok: true, data: 1, events: [] })),
      '',
    );

    a.click();
    const { f, release } = pendingFetch();
    const get = createApiClient(f, '').get('/x');
    expect(a.hasAttribute('aria-busy')).toBe(false);
    release();
    await get;

    resetPressBusy();
    b.click();
    const p = api.post('/y');
    expect(b.hasAttribute('aria-busy')).toBe(false);
    await p;

    const now = performance.now();
    a.click();
    vi.spyOn(performance, 'now').mockReturnValue(now + 1500);
    const late = api.post('/z');
    expect(a.hasAttribute('aria-busy')).toBe(false);
    await late;
  });

  it('同一个按钮两个请求先后回来：最后一个回来才去掉', async () => {
    uninstall = installPressBusy();
    document.body.innerHTML = '<button class="btn">x</button>';
    const btn = document.querySelector('button')!;
    btn.click();
    const one = pendingFetch();
    const p1 = createApiClient(one.f, '').post('/1');
    const two = pendingFetch();
    const p2 = createApiClient(two.f, '').post('/2');
    one.release();
    await p1;
    expect(btn.getAttribute('aria-busy')).toBe('true');
    two.release();
    await p2;
    expect(btn.hasAttribute('aria-busy')).toBe(false);
  });
});

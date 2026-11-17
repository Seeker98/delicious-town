import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RELOAD_COOLDOWN_MS,
  fetchLatestBuild,
  isOutdated,
  markReloadFor,
  parseBuild,
  recentlyReloadedFor,
  typingDraft,
  versionCheckEnabled,
} from './versionCheck';

const json = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

describe('旧版本提醒：版本号', () => {
  afterEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
  });

  it('只认格式正确的版本号', () => {
    expect(parseBuild({ build: 'abc123def456' })).toBe('abc123def456');
    expect(parseBuild({ build: '' })).toBeNull();
    expect(parseBuild({ build: '<script>' })).toBeNull();
    expect(parseBuild({ build: 1 })).toBeNull();
    expect(parseBuild(null)).toBeNull();
    expect(parseBuild('abc123')).toBeNull();
  });

  it('读 version.json 不走缓存；出错、不是 200、不是 JSON 都算没读到', async () => {
    const f = vi.fn(() => json({ build: 'newbuild1234' }));
    await expect(fetchLatestBuild(f, 42)).resolves.toBe('newbuild1234');
    expect(f).toHaveBeenCalledWith('/version.json?t=42', { cache: 'no-store' });
    await expect(fetchLatestBuild(() => json({ build: 'x' }, false))).resolves.toBeNull();
    await expect(fetchLatestBuild(() => Promise.reject(new Error('offline')))).resolves.toBeNull();
    const html = () =>
      Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('<!doctype')) } as Response);
    await expect(fetchLatestBuild(html)).resolves.toBeNull();
  });

  it('开发环境不检查；版本号不同（含回滚）才算旧', () => {
    expect(versionCheckEnabled('abc123', true)).toBe(true);
    expect(versionCheckEnabled('dev', true)).toBe(false);
    expect(versionCheckEnabled('abc123', false)).toBe(false);
    expect(isOutdated('bbb222', 'aaa111')).toBe(true);
    expect(isOutdated('aaa111', 'aaa111')).toBe(false);
    expect(isOutdated(null, 'aaa111')).toBe(false);
  });

  it('正在输入框里写东西才算打字中', () => {
    document.body.innerHTML =
      '<textarea id="ta"></textarea><input id="t" type="text"><input id="pw" type="password"><button id="b"></button>';
    const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    expect(typingDraft()).toBe(false);
    el<HTMLTextAreaElement>('ta').focus();
    expect(typingDraft()).toBe(false);
    el<HTMLTextAreaElement>('ta').value = '写了一半的帖子';
    expect(typingDraft()).toBe(true);
    el<HTMLInputElement>('t').value = '  ';
    el<HTMLInputElement>('t').focus();
    expect(typingDraft()).toBe(false);
    el<HTMLInputElement>('t').value = '买 3 个';
    expect(typingDraft()).toBe(true);
    el<HTMLInputElement>('pw').value = 'x';
    el<HTMLInputElement>('pw').focus();
    expect(typingDraft()).toBe(false);
    el<HTMLButtonElement>('b').focus();
    expect(typingDraft()).toBe(false);
  });

  it('为同一个版本刷新过，冷却期内不再弹；换了版本或过了冷却期照常弹', () => {
    markReloadFor('bbb222', 1000);
    expect(recentlyReloadedFor('bbb222', 1000 + RELOAD_COOLDOWN_MS - 1)).toBe(true);
    expect(recentlyReloadedFor('bbb222', 1000 + RELOAD_COOLDOWN_MS)).toBe(false);
    expect(recentlyReloadedFor('ccc333', 1001)).toBe(false);
    sessionStorage.setItem('dt_version_reload', '{坏的');
    expect(recentlyReloadedFor('bbb222', 1001)).toBe(false);
  });
});

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCaptchaStore } from './captcha';

describe('人机验证框（防脚本 PR②）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('同时等的几个请求共用一次验证', async () => {
    const s = useCaptchaStore();
    const a = s.ask();
    const b = s.ask();
    expect(s.open).toBe(true);
    s.answer('t');
    expect(await a).toBe('t');
    expect(await b).toBe('t');
    expect(s.open).toBe(false);
  });

  it('关掉就都拿到 null；之后再问会重新弹', async () => {
    const s = useCaptchaStore();
    const a = s.ask();
    const b = s.ask();
    s.answer(null);
    expect(await a).toBeNull();
    expect(await b).toBeNull();
    const c = s.ask();
    expect(s.open).toBe(true);
    s.answer('again');
    expect(await c).toBe('again');
  });
});

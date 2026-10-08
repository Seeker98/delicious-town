import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { fromPage } from './origin';

const req = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage;
const JSON_TYPE = { 'content-type': 'application/json' };

describe('道具、商店整理工具只收本页发的 JSON（终审 m8；商店整理终审：/api/shop 的 403 没有测试）', () => {
  it('本页发的：127.0.0.1 或 localhost 同端口，或者不带 origin（curl）', () => {
    expect(fromPage(req({ ...JSON_TYPE, origin: 'http://127.0.0.1:5199' }), 5199)).toBe(true);
    // 商店整理终审：用 localhost 打开会被拦（打印的地址是 127.0.0.1）
    expect(fromPage(req({ ...JSON_TYPE, origin: 'http://localhost:5199' }), 5199)).toBe(true);
    expect(fromPage(req({ 'content-type': 'application/json; charset=utf-8' }), 5199)).toBe(true);
  });

  it('别的网站、别的端口、不是 JSON 的都拦', () => {
    expect(fromPage(req({ ...JSON_TYPE, origin: 'https://evil.example' }), 5199)).toBe(false);
    expect(fromPage(req({ ...JSON_TYPE, origin: 'http://127.0.0.1:5173' }), 5199)).toBe(false);
    expect(fromPage(req({ ...JSON_TYPE, origin: 'http://localhost.evil.example:5199' }), 5199)).toBe(false);
    expect(fromPage(req({ 'content-type': 'text/plain', origin: 'http://127.0.0.1:5199' }), 5199)).toBe(
      false,
    );
    expect(fromPage(req({ origin: 'http://127.0.0.1:5199' }), 5199)).toBe(false);
  });
});

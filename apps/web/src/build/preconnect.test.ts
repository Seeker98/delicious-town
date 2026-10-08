import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { preconnectTags } from './preconnect';

describe('首屏提前连接接口域名（性能排查 2026-10-08）', () => {
  it('接口在单独的域名时，页面头部提前连过去：下载 JS 的同时做完 DNS、TLS 握手', () => {
    expect(preconnectTags('https://api.example.com')).toEqual([
      // 不写 crossorigin：游戏的请求都带 cookie，带 crossorigin 建的是不带凭证的连接，用不上
      { tag: 'link', attrs: { rel: 'preconnect', href: 'https://api.example.com' }, injectTo: 'head' },
    ]);
  });

  it('只取域名部分，带路径、结尾斜杠也一样', () => {
    expect(preconnectTags('https://api.example.com/x/')[0]!.attrs.href).toBe('https://api.example.com');
  });

  it('开发时接口和页面同源（没设 VITE_API_BASE）：不加', () => {
    expect(preconnectTags(undefined)).toEqual([]);
    expect(preconnectTags('')).toEqual([]);
  });
});

describe('静态文件的缓存头（Cloudflare Pages 的 _headers）', () => {
  it('带哈希的 /assets/* 缓存一年、不再回源确认：默认只缓存 4 小时，过后每个文件都要问一次', () => {
    const text = readFileSync(resolve(__dirname, '../../public/_headers'), 'utf8');
    expect(text).toMatch(/^\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable$/m);
    // index.html 不能长期缓存：它引用的文件名随版本变
    expect(text).not.toMatch(/^\/\*\s*$/m);
    expect(text).not.toMatch(/index\.html/);
  });
});

describe('VITE_API_BASE 写错时（稳健性批：原来 new URL 直接报 Invalid URL，看不出是哪个设置）', () => {
  it('不是完整网址：报错写明是 VITE_API_BASE、现在的值和该怎么写', () => {
    expect(() => preconnectTags('/api')).toThrow(/VITE_API_BASE/);
    expect(() => preconnectTags('/api')).toThrow('"/api"');
    expect(() => preconnectTags('/api')).toThrow('https://');
    expect(() => preconnectTags('api.example.com')).toThrow(/VITE_API_BASE/);
  });
});

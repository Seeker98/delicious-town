import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { preconnectTags } from './preconnect';

describe('首屏提前连接接口域名（性能排查 2026-10-08）', () => {
  it('接口在单独的域名时，页面头部提前连过去：下载 JS 的同时做完 DNS、TLS 握手', () => {
    expect(preconnectTags('https://api.example.com')).toEqual([
      // 带 cookie 的请求走不写 crossorigin 的连接；POST 的预检不带凭证，走写 crossorigin 的那条（backlog）
      { tag: 'link', attrs: { rel: 'preconnect', href: 'https://api.example.com' }, injectTo: 'head' },
      {
        tag: 'link',
        attrs: { rel: 'preconnect', href: 'https://api.example.com', crossorigin: 'anonymous' },
        injectTo: 'head',
      },
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
    // index.html 不能长期缓存：它引用的文件名随版本变。全站规则 /* 只能放安全头，不能带缓存
    expect(blocks(text)['/*'] ?? '').not.toMatch(/Cache-Control/i);
    expect(text).not.toMatch(/index\.html/);
  });
});

/** _headers 按路径分块：路径 → 下面缩进的几行 */
function blocks(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let cur: string | null = null;
  for (const line of text.split('\n')) {
    if (/^\S/.test(line)) out[(cur = line.trim())] = '';
    else if (cur && line.trim()) out[cur] += line.trim() + '\n';
  }
  return out;
}

describe('网页的安全响应头（安全审计 M2 2026-10-25）', () => {
  const all = () => blocks(readFileSync(resolve(__dirname, '../../public/_headers'), 'utf8'))['/*'] ?? '';

  it('全站：HSTS（不 preload）、不许被嵌进框里、关掉用不到的浏览器权限', () => {
    const h = all();
    expect(h).toMatch(/^Strict-Transport-Security: max-age=31536000$/m);
    expect(h).not.toMatch(/preload|includeSubDomains/);
    expect(h).toMatch(/^X-Frame-Options: DENY$/m);
    expect(h).toMatch(/^Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)/m);
  });

  it('内容安全策略先只报告不拦：放行自己、Turnstile、Cloudflare 统计，不许内联脚本', () => {
    const csp = /^Content-Security-Policy-Report-Only: (.+)$/m.exec(all())?.[1] ?? '';
    const dir = Object.fromEntries(
      csp.split(';').map((d) => {
        const [k, ...v] = d.trim().split(/\s+/);
        return [k, v];
      }),
    );
    expect(dir['default-src']).toEqual(["'self'"]);
    expect(dir['script-src']).toEqual([
      "'self'",
      'https://challenges.cloudflare.com',
      'https://static.cloudflareinsights.com',
    ]);
    expect(dir['frame-src']).toEqual(['https://challenges.cloudflare.com']);
    expect(dir['connect-src']).toContain('https://cloudflareinsights.com');
    expect(dir['object-src']).toEqual(["'none'"]);
    expect(dir['frame-ancestors']).toEqual(["'none'"]);
    expect(csp).not.toMatch(/unsafe-eval/);
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

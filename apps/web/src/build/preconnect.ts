import type { HtmlTagDescriptor } from 'vite';

/**
 * 首屏提前连接接口域名（性能排查 2026-10-08）：生产环境接口在单独的域名，
 * 原来要等入口 JS 下载、执行完，第一个请求才开始 DNS、TLS 握手。
 * 连两条：游戏的请求都带 cookie，走不写 crossorigin 的那条（带凭证）；跨域的 POST 先发的预检（OPTIONS）
 * 不带凭证，浏览器另开一条连接，写 crossorigin 的那条就是给它的（backlog perf/1008）
 */
export function preconnectTags(
  apiBase: string | undefined,
): Array<HtmlTagDescriptor & { attrs: { rel: string; href: string; crossorigin?: string } }> {
  if (!apiBase) return [];
  // 写错时说清楚是哪个设置（稳健性批：原来 new URL 直接报 Invalid URL，构建或开发时转换 index.html 失败也看不出原因）
  if (!URL.canParse(apiBase))
    throw new Error(
      `VITE_API_BASE 要写完整网址，例如 https://api.example.com，现在是 ${JSON.stringify(apiBase)}`,
    );
  const href = new URL(apiBase).origin;
  return [
    { tag: 'link', attrs: { rel: 'preconnect', href }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'preconnect', href, crossorigin: 'anonymous' }, injectTo: 'head' },
  ];
}

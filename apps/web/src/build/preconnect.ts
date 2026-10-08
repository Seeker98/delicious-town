import type { HtmlTagDescriptor } from 'vite';

/**
 * 首屏提前连接接口域名（性能排查 2026-10-08）：生产环境接口在单独的域名，
 * 原来要等入口 JS 下载、执行完，第一个请求才开始 DNS、TLS 握手。
 * 不写 crossorigin：游戏的请求都带 cookie，带 crossorigin 建的是不带凭证的连接，用不上
 */
export function preconnectTags(
  apiBase: string | undefined,
): Array<HtmlTagDescriptor & { attrs: { rel: string; href: string } }> {
  if (!apiBase) return [];
  return [{ tag: 'link', attrs: { rel: 'preconnect', href: new URL(apiBase).origin }, injectTo: 'head' }];
}

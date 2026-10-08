import type { IncomingMessage } from 'node:http';

/**
 * 只收本页发的 JSON：别的网站跨站发的表单、纯文本请求不能改写文件（终审 m8）。
 * 本页可以用 127.0.0.1 或 localhost 打开（商店整理终审：原来只认 127.0.0.1，用 localhost 打开保存会被拦）；
 * 不带 origin 的是 curl 这类本机命令
 */
export function fromPage(req: IncomingMessage, port: number): boolean {
  const origin = req.headers.origin;
  return (
    !!req.headers['content-type']?.startsWith('application/json') &&
    (origin === undefined || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`)
  );
}

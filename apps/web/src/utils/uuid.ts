/**
 * 随机 UUID（v4）。crypto.randomUUID 只在 https 和 localhost 下有：手机用局域网 IP 打开开发服时没有，
 * 登录等写请求在发出去之前就报错（界面第二批手机试玩时发现）。没有时用 getRandomValues 拼一个，它不挑环境
 */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

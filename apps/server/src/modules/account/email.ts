/**
 * 查重用的邮箱写法（2026-10-16 防小号）：小写、去掉 + 后缀，Gmail 再去掉点、googlemail 当 gmail。
 * 和迁移 0081 补老账号的 SQL 是同一套规则
 */
export function canonicalEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.indexOf('@');
  if (at < 0) return e;
  let local = e.slice(0, at).split('+')[0]!;
  let domain = e.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replaceAll('.', '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

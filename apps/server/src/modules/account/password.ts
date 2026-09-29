import { hash, verify } from '@node-rs/argon2';

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

let dummyHash: Promise<string> | null = null;

/** 账号不存在时也跑一次校验，避免通过响应时间判断用户名是否存在 */
export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  const target = stored ?? (await (dummyHash ??= hash('dummy-password-for-timing')));
  try {
    return (await verify(target, password)) && stored !== null;
  } catch {
    return false;
  }
}

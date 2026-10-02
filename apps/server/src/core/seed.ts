import { createHmac } from 'node:crypto';
import { hashSeed } from '@dt/shared';

let secret = '';

/** 启动时设置服务器私有的种子密钥（环境变量 RNG_SECRET）；没配置时为空，结果和公开的 hashSeed 相同（开发、测试） */
export function setSeedSecret(s: string): void {
  secret = s;
}

/**
 * 业务用的确定性随机种子：混入服务器密钥。仓库是公开的，不混密钥时任何人都能按源码算出
 * 未来的天气、蟹老板的街、菜场上什么货、营业结算的随机数（菜场竞猜、事件合约会被白拿）。
 * 配了密钥时用 HMAC-SHA256：把密钥拼进 32 位的 FNV 只等于多一个 32 位未知状态，
 * 记几天公开结果就能离线穷举还原（238-2 终审 C1）
 */
export function gameSeed(...parts: Array<string | number>): number {
  if (!secret) return hashSeed(...parts);
  return createHmac('sha256', secret).update(parts.join('|')).digest().readUInt32LE(0);
}

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [0, n) 的整数；n <= 0 时返回 0 */
  int(n: number): number;
  /** [1, n] 的整数；n <= 0 时返回 1（对应旧版 getRandowWithMin1） */
  intMin1(n: number): number;
  /** 以概率 p 返回 true */
  chance(p: number): boolean;
}

function fromSource(next: () => number): Rng {
  return {
    next,
    int: (n) => (n <= 0 ? 0 : Math.floor(next() * n)),
    intMin1: (n) => (n <= 0 ? 1 : Math.floor(next() * n) + 1),
    chance: (p) => next() < p,
  };
}

/** sfc32：可复现的伪随机数，用于结算和测试 */
export function seededRng(seed: number): Rng {
  let a = 0x9e3779b9;
  let b = 0x243f6a88;
  let c = 0xb7e15162;
  let d = seed >>> 0;
  const raw = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) raw();
  return fromSource(raw);
}

/** 密码学安全随机数，用于玩家操作 */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(1);
  return fromSource(() => {
    globalThis.crypto.getRandomValues(buf);
    return buf[0]! / 4294967296;
  });
}

/** 固定序列，用于单元测试：依次返回给定的值，用完后循环 */
export function sequenceRng(values: number[]): Rng {
  if (values.length === 0) throw new Error('sequenceRng needs at least one value');
  let i = 0;
  return fromSource(() => values[i++ % values.length]!);
}

/** FNV-1a 32 位哈希，用于从 (区服, 轮次, 餐厅) 生成种子 */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

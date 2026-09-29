export type Tree = Record<string, unknown>;

const isObj = (v: unknown): v is Tree => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 叶子路径：数组和非对象值都是叶子 */
export function leafPaths(v: unknown, prefix = ''): string[] {
  if (!isObj(v)) return prefix ? [prefix] : [];
  return Object.keys(v).flatMap((k) => leafPaths(v[k], prefix ? `${prefix}.${k}` : k));
}

export function getAt(v: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, k) => (isObj(cur) ? cur[k] : undefined), v);
}

/** 按路径写入，返回新对象（沿途没有的对象会创建） */
export function setAt(obj: Tree, path: string, value: unknown): Tree {
  const [head, ...rest] = path.split('.');
  const key = head!;
  if (rest.length === 0) return { ...obj, [key]: value };
  const child = isObj(obj[key]) ? (obj[key] as Tree) : {};
  return { ...obj, [key]: setAt(child, rest.join('.'), value) };
}

/** 按路径删除，返回新对象；删空的父对象一并删掉（"恢复默认"） */
export function removeAt(obj: Tree, path: string): Tree {
  const [head, ...rest] = path.split('.');
  const key = head!;
  if (!(key in obj)) return obj;
  const out: Tree = { ...obj };
  if (rest.length === 0) {
    delete out[key];
    return out;
  }
  const child = obj[key];
  if (!isObj(child)) return obj;
  const next = removeAt(child, rest.join('.'));
  if (Object.keys(next).length === 0) delete out[key];
  else out[key] = next;
  return out;
}

/** 数值页的分组：tuning 下按第二段（tuning.market），其他按第一段（restaurant） */
export function groupOf(path: string): string {
  const parts = path.split('.');
  return parts[0] === 'tuning' && parts.length > 2 ? `${parts[0]}.${parts[1]}` : parts[0]!;
}

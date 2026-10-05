/** 地址查询参数里的整数（问题记录 372：列表的筛选、页码记在地址里）；不是 min 以上的整数时返回 null */
export function queryInt(v: unknown, min: number): number | null {
  if (typeof v !== 'string' || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min ? n : null;
}

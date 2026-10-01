export interface RankSource {
  restId: number;
  name: string;
  value: number;
  /** 同值时比较，越大越靠前（等级榜放经验，周榜放 -最后一次打赏时间） */
  tie?: number;
}

export type RankedRow = RankSource & { rank: number };

/** 竞赛排名：值 desc、tie desc、店号 asc；值 ≤ 0 的去掉；值和 tie 都相同的名次相同（1,2,2,4） */
export function rankRows(rows: RankSource[]): RankedRow[] {
  const sorted = rows
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || (b.tie ?? 0) - (a.tie ?? 0) || a.restId - b.restId);
  const out: RankedRow[] = [];
  sorted.forEach((r, i) => {
    const prev = out[i - 1];
    const same = prev && prev.value === r.value && (prev.tie ?? 0) === (r.tie ?? 0);
    out.push({ ...r, rank: same ? prev.rank : i + 1 });
  });
  return out;
}

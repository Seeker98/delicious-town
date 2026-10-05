/** 新街道导入脚本（scripts/import-new-streets.ts）用到的纯函数，单独拿出来便于测试（backlog 284） */

type Names = Record<string, { name: string }>;

/**
 * 重跑导入时删掉已经不存在的新菜谱译名：既不是老菜谱、也不在这次导入里的 id 都删
 * （原来要手删，不删构建会报错）
 */
export function pruneNames(
  names: Names,
  oldIds: ReadonlySet<number>,
  newIds: ReadonlySet<number>,
): { names: Names; removed: number[] } {
  const out: Names = {};
  const removed: number[] = [];
  for (const [k, v] of Object.entries(names)) {
    const id = Number(k);
    if (oldIds.has(id) || newIds.has(id)) out[k] = v;
    else removed.push(id);
  }
  return { names: out, removed };
}

/** 新街道在勋章对照表（street_medal_map）里没有行时补上；已有的行不动（原来新增街道要手加一行） */
export function addMedalRows(
  rows: ReadonlyArray<{ streetId: number; goodsId: number }>,
  streetIds: readonly number[],
  medalId: (streetId: number) => number,
): { rows: Array<{ streetId: number; goodsId: number }>; added: number[] } {
  const have = new Set(rows.map((r) => r.streetId));
  const added = streetIds.filter((s) => !have.has(s));
  return {
    rows: [...rows, ...added.map((s) => ({ streetId: s, goodsId: medalId(s) }))].sort(
      (a, b) => a.streetId - b.streetId,
    ),
    added,
  };
}

/**
 * 新菜谱 id 已经上线（学过的店按 id 存）：上次导入过的 id 这次没了、或者换了街道，多半是数据那边顺移了 id。
 * 导入脚本据此中止，确认无误后加 --allow-removed 才继续（backlog 284 终审）
 */
export function importConflicts(
  prev: ReadonlyArray<{ id: number; streetId: number }>,
  next: ReadonlyArray<{ id: number; streetId: number }>,
): { removed: number[]; restreeted: number[] } {
  const now = new Map(next.map((c) => [c.id, c.streetId]));
  return {
    removed: prev.filter((c) => !now.has(c.id)).map((c) => c.id),
    restreeted: prev.filter((c) => now.has(c.id) && now.get(c.id) !== c.streetId).map((c) => c.id),
  };
}

/**
 * 导入的菜谱分配学会记录的存储位（重新编号 PR 3）：已有的菜保留原存储位，
 * 新菜从 next 往后分；删掉的菜存储位不回收（老店字节串里那一位可能还有数）
 */
export function assignSlots(
  prev: ReadonlyArray<{ id: number; slot: number }>,
  ids: readonly number[],
  next: number,
): { slots: Map<number, number>; next: number } {
  const had = new Map(prev.map((c) => [c.id, c.slot]));
  const slots = new Map<number, number>();
  let n = next;
  for (const id of ids) slots.set(id, had.get(id) ?? n++);
  return { slots, next: n };
}

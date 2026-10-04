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

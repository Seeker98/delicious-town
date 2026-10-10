/** 老虎机保底奖（backlog 1010）：要在奖池里、不是空格、是稀有的——“平均每几次出一次稀有”把保底都算成稀有。配置构建和后台区服数值共用 */
export function slotFloorErrors(
  floorAwardId: number,
  awards: ReadonlyArray<{ id: number; kind: string; rare: boolean }>,
): string[] {
  const a = awards.find((x) => x.id === floorAwardId);
  if (!a || a.kind === 'empty') return [`tuning.bar.slotFloorAwardId ${floorAwardId} not in slot awards`];
  if (!a.rare) return [`tuning.bar.slotFloorAwardId ${floorAwardId} is not a rare award`];
  return [];
}

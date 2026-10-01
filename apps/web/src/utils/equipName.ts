/** 厨具显示名：命名帽子用服务端给的显示名，其他用道具名（设计 裁定 23） */
export function equipName(
  names: { goodsName(id: number): string },
  e: { goodsId: number; name: string | null },
): string {
  return e.name ?? names.goodsName(e.goodsId);
}

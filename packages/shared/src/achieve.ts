/** 成就进度的键（成就系统 2026-10-19）：口径本身；菜系线的口径一样、街道不同，后面加 @街道。不 import zod（网页用） */
export function achProgressKey(metric: string, streetId: number | null): string {
  return streetId === null ? metric : `${metric}@${streetId}`;
}

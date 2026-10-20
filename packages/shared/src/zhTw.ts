import overrides from './zh-TW-overrides.json';

/**
 * 繁中人工修订（OpenCC 从简中转完以后逐条替换）：[转换后的写法, 想要的写法]。
 * 网页的 i18n:tw 脚本和服务端小镇日报的繁中共用这一份（backlog：日报原来没套，个别用语和界面不一致）
 */
export const ZH_TW_OVERRIDES = overrides as unknown as ReadonlyArray<readonly [string, string]>;

export function applyZhTwOverrides(text: string): string {
  let out = text;
  for (const [from, to] of ZH_TW_OVERRIDES) out = out.split(from).join(to);
  return out;
}

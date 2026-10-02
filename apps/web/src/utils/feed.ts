import type { RestLogDto } from '@dt/shared';
import { activeMessages } from '../i18n';

/** 好友动态的一行文案（服务端只存结构化参数；文案按语言，问题记录 272） */
export function describeFeed(item: RestLogDto, foodName: (id: number) => string): string {
  return activeMessages().events.feed(item, foodName);
}

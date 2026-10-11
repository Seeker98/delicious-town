import { activeMessages } from '../i18n';
import { serverNowMs } from './serverNow';

/** 事件预测离截止还剩多久：一小时以上写“几小时几分”，过了写“已截止”（列表和详情页共用） */
export function predictLeft(closeAt: string, now: number = serverNowMs()): string {
  const p = activeMessages().predict;
  const ms = new Date(closeAt).getTime() - now;
  if (ms <= 0) return p.closedAt;
  const m = Math.floor(ms / 60_000);
  return m >= 60 ? p.leftHm(Math.floor(m / 60), m % 60) : p.leftM(m);
}

import type { PredictListDto } from '@dt/shared';
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

/** 不能参与预测的原因（等级、注册天数、邮箱、冻结）；能参与为空串。列表页、详情页共用（P8 终审） */
export function predictReason(l: PredictListDto | null): string {
  if (!l || !l.reason) return '';
  const r = activeMessages().predict.reasons;
  if (l.reason === 'predict_level') return r.predict_level(l.need.level);
  if (l.reason === 'predict_age') return r.predict_age(l.need.days);
  if (l.reason === 'predict_email') return r.predict_email;
  if (l.reason === 'predict_frozen') return r.predict_frozen;
  return l.reason;
}

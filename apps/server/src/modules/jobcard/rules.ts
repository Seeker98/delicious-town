import { GOODS, type Tuning } from '@dt/config';
import { addDays, gameParts, gameTime, weekStart, type JobCardDto } from '@dt/shared';

/** 周榜周期：最近一次已经过去的“周日 hour 点”所在周的周一 */
export function weekEndPeriod(now: Date, hour: number): string {
  const mon = weekStart(gameParts(now).day);
  return now >= gameTime(addDays(mon, 6), hour) ? mon : addDays(mon, -7);
}

/** 这一周的结算时间：周日 hour 点 */
export function weekEndAt(monday: string, hour: number): Date {
  return gameTime(addDays(monday, 6), hour);
}

export interface CardGate {
  /** 本服要开着的玩法 */
  features: string[];
  level?: number;
  star?: number;
}

/** 每张证要本服开着哪些玩法、几级 / 几星才用得上（天气改版设计 §4.1：只从用得上的证里抽）；没写的证不限 */
export function cardGate(goodsId: number, t: Tuning): CardGate {
  switch (goodsId) {
    case GOODS.marketJobHonor:
      return { features: ['market'] };
    case GOODS.shopJobHonor:
      return { features: ['takeaway'] };
    case GOODS.appraiserCard:
      return { features: ['mysterious'] };
    case GOODS.securityCard:
      return { features: ['temple'] };
    case GOODS.brokerCard:
      return { features: ['exchange'], level: t.exchange.minLevel };
    case GOODS.futuresCard:
      return { features: ['exchange', 'futures'], level: t.exchange.minLevel };
    case GOODS.fundCard:
      return { features: ['fund'] };
    case GOODS.mnaCard:
      return { features: ['acquire'], star: t.acquire.minStar };
    case GOODS.kujiCard:
      return { features: ['kuji'] };
    case GOODS.predictCard:
      return { features: ['predict'], level: t.predict.minLevel };
    default:
      return { features: [] };
  }
}

/** 抽不到的原因：玩法没开、等级不够、星级不够；null 能抽 */
export function cardBlock(
  gate: CardGate,
  featureOn: (f: string) => boolean,
  rest: { level: number; star: number },
): JobCardDto['block'] {
  if (gate.features.some((f) => !featureOn(f))) return { kind: 'feature' };
  if (gate.level !== undefined && rest.level < gate.level) return { kind: 'level', n: gate.level };
  if (gate.star !== undefined && rest.star < gate.star) return { kind: 'star', n: gate.star };
  return null;
}

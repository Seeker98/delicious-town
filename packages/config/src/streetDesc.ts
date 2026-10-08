/**
 * 街道勋章说明里的“最终银币 / 经验收益”（问题记录 378）：说明是手写的文字，改勋章数值时要跟着改。
 * 构建时用 finalRates 核对说明和数值一致；一次性改数值的脚本用 setFinalRates 改写
 */
import { I18N_FILE_LOCALES, type BundleI18n } from './i18n';
import type { Goods, Street } from './types';

export type DescLang = 'zh-CN' | 'en' | 'fr' | 'es';
type Kind = 'both' | 'coin' | 'exp';

const N = '([+-]\\d+(?:\\.\\d+)?)';
/** 每种语言的写法：长短两种（街道里短、道具里长）都认 */
const PATTERNS: Record<DescLang, Array<[Kind, RegExp]>> = {
  'zh-CN': [
    ['both', new RegExp(`^最终经验和银币收益${N}%$`)],
    ['coin', new RegExp(`^最终银币收益${N}%$`)],
    ['exp', new RegExp(`^最终经验收益${N}%$`)],
  ],
  en: [
    ['both', new RegExp(`^final exp and coin(?:s| income) ${N}%$`, 'i')],
    ['coin', new RegExp(`^final coin(?:s| income) ${N}%$`, 'i')],
    ['exp', new RegExp(`^final exp(?: income)? ${N}%$`, 'i')],
  ],
  fr: [
    ['both', new RegExp(`^exp et (?:pièces finales|revenus finaux en pièces) ${N}\u202f%$`, 'i')],
    ['coin', new RegExp(`^(?:pièces finales|revenus finaux en pièces) ${N}\u202f%$`, 'i')],
    ['exp', new RegExp(`^exp finale ${N}\u202f%$`, 'i')],
  ],
  es: [
    ['both', new RegExp(`^exp (?:y monedas finales|e ingresos finales de monedas) ${N}\u00a0%$`, 'i')],
    ['coin', new RegExp(`^(?:monedas finales|ingresos finales de monedas) ${N}\u00a0%$`, 'i')],
    ['exp', new RegExp(`^exp final ${N}\u00a0%$`, 'i')],
  ],
};

/** 改写时用的写法（短的） */
const WRITE: Record<DescLang, Record<Kind, (p: string) => string>> = {
  'zh-CN': {
    both: (p) => `最终经验和银币收益${p}%`,
    coin: (p) => `最终银币收益${p}%`,
    exp: (p) => `最终经验收益${p}%`,
  },
  en: {
    both: (p) => `final EXP and coins ${p}%`,
    coin: (p) => `final coins ${p}%`,
    exp: (p) => `final EXP ${p}%`,
  },
  fr: {
    both: (p) => `EXP et pièces finales ${p}\u202f%`,
    coin: (p) => `pièces finales ${p}\u202f%`,
    exp: (p) => `EXP finale ${p}\u202f%`,
  },
  es: {
    both: (p) => `EXP y monedas finales ${p}\u00a0%`,
    coin: (p) => `monedas finales ${p}\u00a0%`,
    exp: (p) => `EXP final ${p}\u00a0%`,
  },
};

const split = (lang: DescLang, desc: string): string[] =>
  desc
    .split(lang === 'zh-CN' ? /[,，]/ : /,\s*/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
/** 各语言都用“, ”连（简中也是，问题记录 534） */
const join = (parts: string[]): string => parts.join(', ');

function kindOf(lang: DescLang, clause: string): [Kind, number] | null {
  for (const [kind, re] of PATTERNS[lang]) {
    const m = re.exec(clause);
    if (m) return [kind, Number(m[1]) / 100];
  }
  return null;
}

/** 说明里写的最终银币、经验收益（没写的算 0） */
export function finalRates(lang: DescLang, desc: string): { coinRate: number; expRate: number } {
  let coinRate = 0;
  let expRate = 0;
  for (const c of split(lang, desc)) {
    const k = kindOf(lang, c);
    if (!k) continue;
    if (k[0] !== 'exp') coinRate += k[1];
    if (k[0] !== 'coin') expRate += k[1];
  }
  return { coinRate: round(coinRate), expRate: round(expRate) };
}

const round = (x: number) => Math.round(x * 10000) / 10000;
const pct = (x: number) => {
  const v = Math.round(x * 1000) / 10;
  return v >= 0 ? `+${v}` : `${v}`;
};
/** 首字母：英法西第一项大写，其余小写（EXP 这种全大写的词不动） */
function caseFix(lang: DescLang, parts: string[]): string[] {
  if (lang === 'zh-CN') return parts;
  return parts.map((p, i) => {
    const second = p.charAt(1);
    if (i === 0) return p.charAt(0).toUpperCase() + p.slice(1);
    return second !== '' && second === second.toLowerCase() && second !== second.toUpperCase()
      ? p.charAt(0).toLowerCase() + p.slice(1)
      : p;
  });
}

/** 去掉原来的最终收益，按新值写在最前面（两项相同时合成一项；0 不写） */
export function setFinalRates(lang: DescLang, desc: string, coinRate: number, expRate: number): string {
  const rest = split(lang, desc).filter((c) => kindOf(lang, c) === null);
  const head: string[] = [];
  const w = WRITE[lang];
  if (coinRate !== 0 && coinRate === expRate) head.push(w.both(pct(coinRate)));
  else {
    if (coinRate !== 0) head.push(w.coin(pct(coinRate)));
    if (expRate !== 0) head.push(w.exp(pct(expRate)));
  }
  return join(caseFix(lang, [...head, ...rest]));
}

/** 构建检查：街道和勋章说明（简中和英法西）里写的最终银币、经验收益要和勋章数值一致 */
export function checkStreetDescs(
  streets: readonly Street[],
  goods: readonly Goods[],
  i18n: BundleI18n,
  errors: string[],
): void {
  const show = (x: number) => `${pct(x)}%`;
  const byId = new Map(goods.map((g) => [g.id, g]));
  for (const s of streets) {
    const medal = byId.get(s.medalId);
    if (!medal) continue;
    const want = { coinRate: medal.effects.coinRate ?? 0, expRate: medal.effects.expRate ?? 0 };
    const check = (what: string, lang: DescLang, desc: string | undefined) => {
      if (desc === undefined) return;
      const got = finalRates(lang, desc);
      if (Math.abs(got.coinRate - want.coinRate) > 1e-9 || Math.abs(got.expRate - want.expRate) > 1e-9)
        errors.push(
          `${what} desc (${lang}) says final coin ${show(got.coinRate)} exp ${show(got.expRate)}, ` +
            `medal ${medal.id} has coin ${show(want.coinRate)} exp ${show(want.expRate)}`,
        );
    };
    check(`street ${s.id}`, 'zh-CN', s.desc);
    check(`goods ${medal.id}`, 'zh-CN', medal.desc);
    for (const l of I18N_FILE_LOCALES) {
      check(`street ${s.id}`, l, i18n[l].streets[String(s.id)]?.desc);
      check(`goods ${medal.id}`, l, i18n[l].goods[String(medal.id)]?.desc);
    }
  }
}

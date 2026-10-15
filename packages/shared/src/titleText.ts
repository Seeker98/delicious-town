// 定制称号文字的上限和清理（网页后台也要用；不带 zod，免得 zod 打进网页）

/** 定制称号（问题记录 539，设计 2026-10-09）：名字、说明、备注的上限，按看上去的字数 */
export const TITLE_MAX = 10;
export const TITLE_DESC_MAX = 30;
export const TITLE_NOTE_MAX = 100;
/** 一份附件里最多几个称号、一次邮件最多发几家店 */
export const MAIL_ICONS_MAX = 5;
export const MAIL_RESTS_MAX = 50;

const cp = (n: number) => String.fromCodePoint(n);
const range = (a: number, b: number) => `${cp(a)}-${cp(b)}`;
/**
 * 去掉的字符：控制字符（C0、C1，含换行）、零宽空格 U+200B、零宽非连接符 U+200C、U+FEFF、
 * 方向控制 U+200E、U+200F、U+202A~202E、U+2066~2069，看不见的 U+00AD、U+034F、U+2060~2064，
 * 韩文填充字 U+115F、U+1160、U+3164、U+FFA0（终审：只有这些字的名字会成空白徽章）。
 * emoji 要用的零宽连接符 U+200D、变体选择符 U+FE00~FE0F 保留
 */
const STRIP = new RegExp(
  `[${range(0, 0x1f)}${range(0x7f, 0x9f)}${cp(0xad)}${cp(0x34f)}${cp(0x115f)}${cp(0x1160)}` +
    `${range(0x200b, 0x200c)}${range(0x200e, 0x200f)}${range(0x202a, 0x202e)}${range(0x2060, 0x2064)}` +
    `${range(0x2066, 0x2069)}${cp(0x3164)}${cp(0xfeff)}${cp(0xffa0)}]`,
  'gu',
);
/** 单独出现时看不见的：连接符、变体选择符；名字去掉它们和空白后要还有字 */
const JOINERS = new RegExp(`[${cp(0x200d)}${range(0xfe00, 0xfe0f)}]`, 'gu');

/** 清理后只剩连接符、变体选择符和空白时当作空串 */
export function cleanTitleText(s: string): string {
  const c = s.replace(STRIP, '').trim();
  return c.replace(JOINERS, '').trim() === '' ? '' : c;
}

/**
 * 用到时才建：shared 玩家网页也会加载，老的安卓 WebView 没有 Intl.Segmenter，
 * 模块加载时就建会让整个网页打不开；没有时退回按码位数（只影响后台的字数提示）
 */
let segmenter: Intl.Segmenter | null | undefined;
/** 按字素数：👨‍🍳、国旗都算 1 个 */
export function graphemeLen(s: string): number {
  if (segmenter === undefined)
    segmenter =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter('zh', { granularity: 'grapheme' })
        : null;
  if (!segmenter) return [...s].length;
  let n = 0;
  for (const _ of segmenter.segment(s)) n++;
  return n;
}

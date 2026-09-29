export const RESERVED_NAME_WORDS: readonly string[] = [
  '镇长',
  '蟹老板',
  '菜园姐',
  '雯姐',
  '奸商',
  '蟹堡皇',
  '测试',
  '痞老板',
  '海绵宝宝',
  '派大星',
  '珊迪',
  '章鱼哥',
  '市长',
  '主席',
];

export type RestaurantNameCheck = 'ok' | 'empty' | 'bad_chars' | 'too_long' | 'reserved';

const ALLOWED = /^[A-Za-z0-9_\-一-龥]+$/;
const ALNUM = /[A-Za-z0-9]/;

/** 餐厅名规则（规格书 02 §2.1）：先去掉首尾空格；字母数字计 5、其他计 8，累计 <= 64 */
export function checkRestaurantName(raw: string): RestaurantNameCheck {
  const name = raw.trim();
  if (!name) return 'empty';
  if (!ALLOWED.test(name)) return 'bad_chars';
  let weight = 0;
  for (const ch of name) weight += ALNUM.test(ch) ? 5 : 8;
  if (weight > 64) return 'too_long';
  if (RESERVED_NAME_WORDS.some((w) => name.includes(w))) return 'reserved';
  return 'ok';
}

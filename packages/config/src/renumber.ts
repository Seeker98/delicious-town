/**
 * 重新编号（设计 docs/superpowers/specs/2026-10-05-id-renumber-design.md）：按对照表改写 JSON 里的道具、食材、菜谱编号。
 * 配置数据的一次性改写（scripts/renumber-apply.ts）和数据库迁移 0049 共用。规则按键名认（见 ID_KEYS 等），
 * 是按开发库全部 JSON 列的路径和服务端写日志、新闻的地方清点出来的。
 * 冻结：迁移 0049 依赖它，上线后不要改规则（改了以后在空库上重跑迁移的结果会和线上不一样）
 */
export type IdKind = 'goods' | 'foods' | 'cookbooks';
export type IdMaps = Record<IdKind, ReadonlyMap<number, number>>;
export type JsonPath = Array<string | number>;
/** 按位置认的编号：路径里的 '*' 匹配任意数组下标或对象键 */
export type PathRule = readonly [ReadonlyArray<string | number | '*'>, IdKind];
export interface Orphan {
  kind: IdKind;
  id: number;
  path: JsonPath;
}

/** 新号段（设计 §2）：和所有旧号段都不重叠 */
export function isNewId(kind: IdKind, id: number): boolean {
  if (kind === 'goods') return id >= 10000 && id <= 89999;
  if (kind === 'foods') return id >= 1001 && id <= 9999;
  return id >= 100001 && id <= 199999;
}

/** 值是某类编号的键 */
export const ID_KEYS: Readonly<Record<string, IdKind>> = {
  goodsId: 'goods',
  cardId: 'goods', // 嘻哈男孩的工资卡（日志 hiphop.wage）
  medal: 'goods', // 基金勋章（日志 fund.claim、区服数值 fund.tiers）
  nextid: 'goods', // 宝石的下一阶（主表 value）
  foodsId: 'foods',
  mainFoodsId: 'foods',
  subFoodsId: 'foods',
  addFoodsId: 'foods',
  resFoodsId: 'foods',
  punished: 'foods', // 菜园偷菜被边牧逮住留下的食材（日志 yard.stolen）
  cookbookId: 'cookbooks',
};
/** 值是编号列表的键：元素是数字、{ id, … } 或 [编号, …] */
export const ID_LIST_KEYS: Readonly<Record<string, IdKind>> = {
  goods: 'goods',
  needGoods: 'goods',
  foods: 'foods',
  cookbooks: 'cookbooks', // 特色菜课遗忘的菜谱（日志 mc.forget）
};

/** 区服数值（data/game/tuning.json、shard_config.override.tuning）里不带键名的编号；带键名的由通用规则处理 */
export const TUNING_ID_PATHS: readonly PathRule[] = [
  [['shop', 'specialFallbackGoods'], 'goods'],
  [['shop', 'discardable', '*'], 'goods'],
  [['shop', 'noSell', '*'], 'goods'],
  [['tower', 'rankGifts', '*', 1], 'goods'],
  [['takeaway', 'awards', '*', 0], 'goods'],
  [['takeaway', 'customer', 'success'], 'goods'],
  [['takeaway', 'customer', 'fail'], 'goods'],
  [['hiphop', 'weeklyCards', '*'], 'goods'],
  [['hiphop', 'wages', '*', 0], 'goods'],
  [['hiphop', 'wages', '*', 1], 'goods'],
  [['temple', 'missileAttack', '*', 0], 'goods'],
  [['mysterious', 'championGoodsId'], 'goods'],
  [['town', 'mysteryExclude', '*'], 'foods'],
];

/** 区服数值里按编号做键的对象（只改键，不改值）：交易所参考价覆盖按食材编号做键（终审 I2） */
export const TUNING_KEY_PATHS: readonly PathRule[] = [[['exchange', 'refOverrides'], 'foods']];

const KIND_VALUES: ReadonlySet<unknown> = new Set(['goods', 'foods']);
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

function matches(rule: PathRule[0], path: JsonPath): boolean {
  return rule.length === path.length && rule.every((seg, i) => seg === '*' || seg === path[i]);
}

export function rewriteIds(
  value: unknown,
  maps: IdMaps,
  opts: {
    paths?: readonly PathRule[];
    keys?: Readonly<Record<string, IdKind>>;
    /** 这些位置上的对象，键是编号（只改键；不进 edits，保留排版的文本替换不支持换键） */
    keyPaths?: readonly PathRule[];
  } = {},
): { value: unknown; edits: Map<string, number>; orphans: Orphan[] } {
  const edits = new Map<string, number>();
  const orphans: Orphan[] = [];
  const keys = { ...ID_KEYS, ...opts.keys };
  const paths = opts.paths ?? [];
  const keyPaths = opts.keyPaths ?? [];

  const swap = (kind: IdKind, v: unknown, path: JsonPath): unknown => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) return v;
    const n = maps[kind].get(v);
    if (n !== undefined) {
      edits.set(JSON.stringify(path), n);
      return n;
    }
    if (!isNewId(kind, v)) orphans.push({ kind, id: v, path });
    return v;
  };
  const byPath = (path: JsonPath): IdKind | undefined => paths.find(([p]) => matches(p, path))?.[1];

  const walk = (x: unknown, path: JsonPath, listKind: IdKind | undefined): unknown => {
    if (Array.isArray(x)) {
      return x.map((el, i) => {
        const p = [...path, i];
        if (listKind !== undefined) {
          if (typeof el === 'number') return swap(listKind, el, p);
          if (Array.isArray(el))
            return el.map((y, j) => (j === 0 ? swap(listKind, y, [...p, 0]) : walk(y, [...p, j], undefined)));
        }
        return walk(el, p, listKind);
      });
    }
    if (isObj(x)) {
      // 这个对象里哪些字段是编号：所在列表 > 自带种类 > 键名；一个字段只换一次
      const fieldKind = new Map<string, IdKind>();
      if (listKind !== undefined && typeof x.id === 'number') fieldKind.set('id', listKind);
      const own = KIND_VALUES.has(x.kind) ? x.kind : KIND_VALUES.has(x.type) ? x.type : undefined;
      if (own !== undefined)
        for (const f of ['id', 'itemId'])
          if (!fieldKind.has(f) && typeof x[f] === 'number') fieldKind.set(f, own as IdKind);
      for (const k of Object.keys(x))
        if (!fieldKind.has(k) && keys[k] && typeof x[k] === 'number') fieldKind.set(k, keys[k]);
      const out: Record<string, unknown> = {};
      const keyKind = keyPaths.find(([kp]) => matches(kp, path))?.[1];
      for (const [k0, v] of Object.entries(x)) {
        let k = k0;
        if (keyKind !== undefined && /^\d+$/.test(k0)) {
          const id = Number(k0);
          const n = maps[keyKind].get(id);
          if (n !== undefined) k = String(n);
          else if (!isNewId(keyKind, id)) orphans.push({ kind: keyKind, id, path: [...path, k0] });
        }
        const p = [...path, k];
        const pk = byPath(p);
        const fk = fieldKind.get(k);
        if (pk !== undefined && typeof v === 'number') out[k] = swap(pk, v, p);
        else if (fk !== undefined) out[k] = swap(fk, v, p);
        else out[k] = walk(v, p, Array.isArray(v) ? ID_LIST_KEYS[k] : undefined);
      }
      return out;
    }
    if (typeof x === 'number') {
      const pk = byPath(path);
      return pk === undefined ? x : swap(pk, x, path);
    }
    return x;
  };

  return { value: walk(value, [], undefined), edits, orphans };
}

/**
 * 按路径替换 JSON 文本里的数字，其余字符（空格、换行、键顺序、注释式的排版）原样保留。
 * edits 的键是 JSON.stringify(路径)；有没用上的路径时抛错
 */
export function patchJsonText(text: string, edits: ReadonlyMap<string, number>): string {
  type Frame = { arr: boolean; idx: number; key: string | null; wantKey: boolean };
  const stack: Frame[] = [];
  const used = new Set<string>();
  let out = '';
  let i = 0;
  const pathNow = (): JsonPath => stack.map((f) => (f.arr ? f.idx : f.key!));
  while (i < text.length) {
    const c = text[i]!;
    if (c === '{' || c === '[') {
      stack.push({ arr: c === '[', idx: 0, key: null, wantKey: c === '{' });
      out += c;
      i++;
    } else if (c === '}' || c === ']') {
      stack.pop();
      out += c;
      i++;
    } else if (c === ',') {
      const top = stack[stack.length - 1]!;
      if (top.arr) top.idx++;
      else top.wantKey = true;
      out += c;
      i++;
    } else if (c === ':') {
      stack[stack.length - 1]!.wantKey = false;
      out += c;
      i++;
    } else if (c === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const raw = text.slice(i, j + 1);
      const top = stack[stack.length - 1];
      if (top && !top.arr && top.wantKey) top.key = JSON.parse(raw) as string;
      out += raw;
      i = j + 1;
    } else if (c === '-' || (c >= '0' && c <= '9')) {
      let j = i + 1;
      while (j < text.length && /[0-9eE+\-.]/.test(text[j]!)) j++;
      const key = JSON.stringify(pathNow());
      const n = edits.get(key);
      if (n !== undefined) {
        used.add(key);
        out += String(n);
      } else out += text.slice(i, j);
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  const missed = [...edits.keys()].filter((k) => !used.has(k));
  if (missed.length > 0) throw new Error(`patchJsonText: paths not found ${missed.join(' ')}`);
  return out;
}

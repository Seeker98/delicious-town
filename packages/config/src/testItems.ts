import { realBuild } from './testBundle';

/** 名字 → 编号；有重名就抛错（按名字查编号要求名字唯一，不能静默取最后一个） */
export function indexByName(
  kind: string,
  list: ReadonlyArray<{ id: number; name: string }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const x of list) {
    const had = out.get(x.name);
    if (had !== undefined) throw new Error(`duplicate ${kind} name ${x.name}: ${had}, ${x.id}`);
    out.set(x.name, x.id);
  }
  return out;
}

/** 测试里按名字查编号（重新编号 PR 2）：名字各自唯一，换编号后测试不用改 */
let maps: Record<'goods' | 'foods' | 'cookbooks', Map<string, number>> | null = null;
function lookup(kind: 'goods' | 'foods' | 'cookbooks', name: string): number {
  if (!maps) {
    const b = realBuild().bundle!;
    maps = {
      goods: indexByName('goods', b.goods),
      foods: indexByName('foods', b.foods),
      cookbooks: indexByName('cookbooks', b.cookbooks),
    };
  }
  const id = maps[kind].get(name);
  if (id === undefined) throw new Error(`no ${kind} named ${name}`);
  return id;
}
export const gid = (name: string) => lookup('goods', name);
export const fid = (name: string) => lookup('foods', name);
export const cid = (name: string) => lookup('cookbooks', name);

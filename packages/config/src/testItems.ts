import { realBuild } from './testBundle';

/** 测试里按名字查编号（重新编号 PR 2）：名字各自唯一，换编号后测试不用改 */
let maps: Record<'goods' | 'foods' | 'cookbooks', Map<string, number>> | null = null;
function lookup(kind: 'goods' | 'foods' | 'cookbooks', name: string): number {
  if (!maps) {
    const b = realBuild().bundle!;
    const of = (list: ReadonlyArray<{ id: number; name: string }>) =>
      new Map(list.map((x) => [x.name, x.id]));
    maps = { goods: of(b.goods), foods: of(b.foods), cookbooks: of(b.cookbooks) };
  }
  const id = maps[kind].get(name);
  if (id === undefined) throw new Error(`no ${kind} named ${name}`);
  return id;
}
export const gid = (name: string) => lookup('goods', name);
export const fid = (name: string) => lookup('foods', name);
export const cid = (name: string) => lookup('cookbooks', name);

import { testConfig } from './config';

/** 测试里按名字查编号（重新编号 PR 2）：名字各自唯一，换编号后测试不用改 */
let maps: Record<'goods' | 'foods' | 'cookbooks', Map<string, number>> | null = null;
function lookup(kind: 'goods' | 'foods' | 'cookbooks', name: string): number {
  if (!maps) {
    const b = testConfig().bundle;
    // 有重名就抛错（和 packages/config/src/testItems.ts 的 indexByName 一样），不能静默取最后一个
    const of = (list: ReadonlyArray<{ id: number; name: string }>) => {
      const out = new Map<string, number>();
      for (const x of list) {
        if (out.has(x.name)) throw new Error(`duplicate name ${x.name}: ${out.get(x.name)}, ${x.id}`);
        out.set(x.name, x.id);
      }
      return out;
    };
    maps = { goods: of(b.goods), foods: of(b.foods), cookbooks: of(b.cookbooks) };
  }
  const id = maps[kind].get(name);
  if (id === undefined) throw new Error(`no ${kind} named ${name}`);
  return id;
}
export const gid = (name: string) => lookup('goods', name);
export const fid = (name: string) => lookup('foods', name);
export const cid = (name: string) => lookup('cookbooks', name);

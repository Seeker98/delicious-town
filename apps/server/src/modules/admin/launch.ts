import { ErrorCode, type LaunchCheckDto } from '@dt/shared';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { AdminActor } from './access';
import { createAdminShards } from './shards';

/** 上线检查项（设计 §7）：开发期为方便测试关掉、上线前必须打开的开关 */
export const LAUNCH_CHECKS: ReadonlyArray<{ path: string; want: boolean; why: string }> = [
  { path: 'tuning.hiphop.requireVerifiedEmail', want: true, why: '防止小号刷嘻哈奖励' },
  { path: 'tuning.town.shake.limitIp', want: true, why: '摇钱树按 IP 限次，防多号' },
  { path: 'tuning.town.shake.limitDevice', want: true, why: '摇钱树按设备限次，防多号' },
  { path: 'tuning.friend.requireVerifiedEmail', want: true, why: '好友互动要求验证邮箱（防止被改回去）' },
];

type Tree = Record<string, unknown>;
const isObj = (v: unknown): v is Tree => typeof v === 'object' && v !== null && !Array.isArray(v);

function getAt(tree: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (isObj(v) ? v[k] : undefined), tree);
}

/** 返回改了 path 的新对象，其他已有的覆盖原样保留 */
function setAt(tree: Tree, path: string, value: unknown): Tree {
  const [head, ...rest] = path.split('.');
  const out: Tree = { ...tree };
  out[head!] =
    rest.length === 0 ? value : setAt(isObj(tree[head!]) ? (tree[head!] as Tree) : {}, rest.join('.'), value);
  return out;
}

/** 上线检查（设计 §7）：列出每个开着的区服没通过的项；管理员一键改成上线值，走区服数值保存（记历史和审计） */
export function createLaunchCheck(game: Game) {
  const db = game.app.db;
  const shards = createAdminShards(game);

  async function check(): Promise<LaunchCheckDto> {
    const open = await db
      .selectFrom('shard')
      .select(['id', 'name'])
      .where('status', '=', 'open')
      .orderBy('id')
      .execute();
    const list: LaunchCheckDto['shards'] = [];
    for (const s of open) {
      const settings = await shards.settings(s.id);
      list.push({
        shardId: s.id,
        shardName: s.name,
        version: settings.version,
        items: LAUNCH_CHECKS.map((c) => {
          const current = getAt(settings.effective, c.path);
          return { path: c.path, want: c.want, current: current ?? null, ok: current === c.want, why: c.why };
        }),
      });
    }
    return { shards: list, allOk: list.every((s) => s.items.every((i) => i.ok)) };
  }

  return {
    check,
    async fix(actor: AdminActor, b: { shardId: number; version: number }): Promise<LaunchCheckDto> {
      const settings = await shards.settings(b.shardId);
      // 先比版本：页面上看到的已经过期就报冲突，不管现在是否已全部通过
      if (settings.version !== b.version)
        throw new AppError(ErrorCode.VERSION_CONFLICT, 409, { version: settings.version });
      let override = settings.override as Tree;
      for (const c of LAUNCH_CHECKS)
        if (getAt(settings.effective, c.path) !== c.want) override = setAt(override, c.path, c.want);
      // 已经全部通过：不写新版本（幂等）
      if (override === settings.override) return check();
      await shards.save(actor, b.shardId, { override, note: '上线检查', version: b.version });
      return check();
    },
  };
}

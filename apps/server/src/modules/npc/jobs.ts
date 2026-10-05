import { gameParts, seededRng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { withRestaurant } from '../../db/tx';
import { ensureNpc, npcIdOf, npcInvite, restockNpc, topUpNpcCoin } from './npc';
import { gameSeed } from '../../core/seed';

const HOUR = 3_600_000;

export function npcJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      // 每小时：没有蟹老板就建（新区服、首次部署），并补发邀请
      name: 'npc-maintain',
      feature: 'friend',
      period: (now) => String(Math.floor(now.getTime() / HOUR)),
      run: async ({ shardId, settings, period }) => {
        const npc = await ensureNpc(
          d.db,
          d.config,
          settings.tuning.friend.npc,
          shardId,
          seededRng(gameSeed(shardId, 'npc-create', period)),
        );
        if (npc.created) await topUpNpcCoin(d.db, npc.id, settings.tuning.town.shake.krabDailyCoin);
        const invited = await npcInvite(d.db, { shardId });
        return { npcId: npc.id, created: npc.created, invited };
      },
    },
    {
      // 每天 00:05 之后补一次货
      name: 'npc-restock',
      feature: 'friend',
      period: (now) => {
        const p = gameParts(now);
        return p.hour * 60 + p.minute >= 5 ? p.day : null;
      },
      run: async ({ shardId, settings, period }) => {
        const id = await npcIdOf(d.db, shardId);
        if (id === null) return { skipped: true };
        const kinds = await withRestaurant(d.db, id, async (tx) => {
          await topUpNpcCoin(tx, id, settings.tuning.town.shake.krabDailyCoin);
          return restockNpc(
            tx,
            d.config,
            settings.tuning.friend.npc,
            id,
            seededRng(gameSeed(shardId, 'npc-restock', period)),
          );
        });
        return { topped: kinds };
      },
    },
  ];
}

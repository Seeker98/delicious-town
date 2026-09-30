import type { GameDeps } from '../../core/deps';
import type { WorldService } from '../world/service';
import { createDine } from '../interact/dine';
import { createRoach } from '../interact/roach';
import { createFlip } from '../interact/flip';
import { createRefuel } from '../interact/refuel';
import { createFriendReads } from './reads';
import { createRelations } from './relations';

/** 好友互动的所有服务（后面的任务往这里加） */
export function createSocialService(d: GameDeps, world: WorldService) {
  void world;
  return {
    relations: createRelations(d),
    reads: createFriendReads(d),
    refuel: createRefuel(d),
    flip: createFlip(d),
    roach: createRoach(d),
    dine: createDine(d),
  };
}

export type SocialService = ReturnType<typeof createSocialService>;

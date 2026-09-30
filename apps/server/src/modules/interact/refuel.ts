import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, notEnough } from '../../core/errors';
import { restLog, setRest } from '../../core/op';
import { feedLog, runPairOp } from '../../core/pair';
import { gainOil, spendCoin } from '../../core/resources';
import { drawDtTickets } from '../../core/tickets';
import { refuelDraws } from './rules';

/** 帮好友加油（规格书 13 §13.5） */
export function createRefuel(d: GameDeps) {
  return {
    refuel(ctx: RestCtx, b: { restId: number; num: number }) {
      return runPairOp(
        d,
        ctx,
        b.restId,
        { feature: 'friend', source: 'friend.refuel', friend: 'required' },
        async (p) => {
          const { me, them } = p;
          const need = them.rest.oil_max - them.rest.oil;
          if (need <= 0) throw invalidState('friend_oil_full');
          if (me.rest.coin <= 0) throw notEnough('coin', 1, me.rest.coin);
          const add = Math.min(need, b.num === -1 ? need : b.num, me.rest.coin);
          spendCoin(me, add);
          gainOil(them, add, { event: false });
          if (them.rest.state === 2 && them.rest.oil > 0) {
            setRest(them, 'state', 1);
            setRest(them, 'state_reason', null);
            restLog(them, 'rest.reopen');
          }
          const tickets = await drawDtTickets(
            me,
            refuelDraws(add, them.rest.oil_max, me.tuning.friend.refuel),
          );
          await emitAction(me, 'friend.refuel');
          feedLog(p, 'friend.refuel', { oil: add });
          return { oil: add, tickets };
        },
      );
    },
  };
}

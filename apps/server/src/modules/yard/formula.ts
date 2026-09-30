import { sql, type Kysely } from 'kysely';
import { GOODS, GOODS_TYPE, type Formula, type GameConfig } from '@dt/config';
import {
  ErrorCode,
  pickWeighted,
  type ComposeResultDto,
  type FormulaAppraiseResultDto,
  type FormulasDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState } from '../../core/errors';
import { opLuck } from '../../core/luck';
import type { Op } from '../../core/op';
import { spendStrength } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { addFoods, subFoods } from '../cupboard/foods';
import { consumeGoods, grantGoodsOp, hasValidHonor } from '../store/goods';
import { badInput, subBasket } from './common';
import { composeExtra, formulaAppraiseRate, formulaPart, type YardTuning } from './rules';

/** 配方碎片不够（计划裁定 7） */
function fragmentShort(part: 'main' | 'sub', formulaId: number, need: number, have: number): AppError {
  return new AppError(ErrorCode.NOT_ENOUGH, 400, { kind: 'fragment', part, id: formulaId, need, have });
}

function formulaOf(o: Op, id: number): Formula {
  const f = o.config.formulas.get(id);
  if (!f) throw badInput('no_formula');
  return f;
}

const rowOf = (o: Op, formulaId: number) =>
  o.tx
    .selectFrom('rest_formula')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .where('formula_id', '=', formulaId)
    .executeTakeFirst();

/** 配方鉴定道具：value 里有 formulaRate 的道具，勋章（星月密卷）除外（裁定 9） */
export function formulaTools(config: GameConfig): Array<{ goodsId: number; rate: number }> {
  return config.bundle.goods
    .filter((g) => (g.effects.formulaRate ?? 0) > 0 && g.type !== GOODS_TYPE.honor)
    .map((g) => ({ goodsId: g.id, rate: g.effects.formulaRate! }));
}

/** 配方页（设计文档 §5） */
export async function formulasView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  t: YardTuning,
): Promise<FormulasDto> {
  const rows = await db.selectFrom('rest_formula').selectAll().where('rest_id', '=', rest.id).execute();
  const byId = new Map(rows.map((r) => [r.formula_id, r]));
  const basket = new Map(
    (
      await db.selectFrom('yard_basket').select(['foods_id', 'num']).where('rest_id', '=', rest.id).execute()
    ).map((r) => [r.foods_id, r.num]),
  );
  const cupboard = new Map(
    (
      await db
        .selectFrom('cupboard_food')
        .select(['foods_id', 'num'])
        .where('rest_id', '=', rest.id)
        .execute()
    ).map((r) => [r.foods_id, r.num]),
  );
  const tools = formulaTools(config);
  const held = new Map(
    (
      await db
        .selectFrom('store_item')
        .select(['goods_id', 'num'])
        .where('rest_id', '=', rest.id)
        .where('goods_id', 'in', [...tools.map((x) => x.goodsId), GOODS.formulaScroll, GOODS.formulaEssence])
        .execute()
    ).map((r) => [r.goods_id, r.num]),
  );
  return {
    formulas: config.bundle.formulas.map((f) => {
      const r = byId.get(f.id);
      const have = {
        main: basket.get(f.mainFoodsId) ?? 0,
        sub: cupboard.get(f.subFoodsId) ?? 0,
        add: cupboard.get(f.addFoodsId) ?? 0,
      };
      return {
        id: f.id,
        name: f.name,
        mainFoodsId: f.mainFoodsId,
        subFoodsId: f.subFoodsId,
        addFoodsId: f.addFoodsId,
        resFoodsId: f.resFoodsId,
        mainNum: r?.main_num ?? 0,
        subNum: r?.sub_num ?? 0,
        learned: r?.learned ?? false,
        have,
        maxCompose: r?.learned
          ? Math.min(have.main, have.sub, have.add, Math.floor(rest.strength / t.composeStrength), 99)
          : 0,
      };
    }),
    tools: tools.map((x) => ({ ...x, num: held.get(x.goodsId) ?? 0 })),
    scrolls: held.get(GOODS.formulaScroll) ?? 0,
    essence: held.get(GOODS.formulaEssence) ?? 0,
    strength: rest.strength,
    composeStrength: t.composeStrength,
  };
}

/** 配方鉴定（规格书 09 §9.3，裁定 8、9）：每次扣道具 1 + 玄奥配方 1；同一配方的碎片合并写库 */
export async function appraiseFormula(
  o: Op,
  b: { toolId: number; times: number },
): Promise<FormulaAppraiseResultDto> {
  const tool = formulaTools(o.config).find((x) => x.goodsId === b.toolId);
  if (!tool) throw badInput('not_formula_tool');
  await consumeGoods(o, b.toolId, b.times);
  await consumeGoods(o, GOODS.formulaScroll, b.times);
  const t = o.tuning.yard;
  const { rate: luck } = await opLuck(o);
  const moonDef = o.config.requireGoods(GOODS.moonScroll).effects;
  const moon = (await hasValidHonor(o, GOODS.moonScroll))
    ? { rate: moonDef.formulaRate ?? 0, secToMain: moonDef.secToMain ?? 0 }
    : null;
  const rate = formulaAppraiseRate(tool.rate, luck, moon?.rate ?? 0, t);
  const rows = await o.tx.selectFrom('rest_formula').selectAll().where('rest_id', '=', o.rest.id).execute();
  const state = new Map(
    rows.map((r) => [r.formula_id, { main: 0, sub: 0, hasSub: r.sub_num > 0 || r.learned }]),
  );
  const results: FormulaAppraiseResultDto['results'] = [];
  for (let i = 0; i < b.times; i++) {
    if (!o.rng.chance(rate)) {
      results.push({ ok: false });
      continue;
    }
    const f = pickWeighted(o.config.formulaPool, o.rng);
    const s = state.get(f.id) ?? { main: 0, sub: 0, hasSub: false };
    const r = formulaPart(o.rng, moon, s.hasSub, t);
    if (r.part === 'main') s.main += 1;
    else {
      s.sub += 1;
      s.hasSub = true;
    }
    state.set(f.id, s);
    results.push({ ok: true, formulaId: f.id, part: r.part, upgraded: r.upgraded });
  }
  for (const [formulaId, s] of state) {
    if (s.main + s.sub === 0) continue;
    await o.tx
      .insertInto('rest_formula')
      .values({ rest_id: o.rest.id, formula_id: formulaId, main_num: s.main, sub_num: s.sub })
      .onConflict((oc) =>
        oc.columns(['rest_id', 'formula_id']).doUpdateSet({
          main_num: sql<number>`rest_formula.main_num + ${s.main}`,
          sub_num: sql<number>`rest_formula.sub_num + ${s.sub}`,
        }),
      )
      .execute();
  }
  await emitAction(o, 'formula.appraise', b.times);
  return { results };
}

/** 学习：主辅碎片各 1 */
export async function learnFormula(o: Op, b: { formulaId: number }): Promise<{ formulaId: number }> {
  const f = formulaOf(o, b.formulaId);
  const row = await rowOf(o, f.id);
  if (row?.learned) throw invalidState('formula_learned');
  const main = row?.main_num ?? 0;
  const sub = row?.sub_num ?? 0;
  if (main < 1) throw fragmentShort('main', f.id, 1, main);
  if (sub < 1) throw fragmentShort('sub', f.id, 1, sub);
  await o.tx
    .updateTable('rest_formula')
    .set({ main_num: main - 1, sub_num: sub - 1, learned: true })
    .where('rest_id', '=', o.rest.id)
    .where('formula_id', '=', f.id)
    .execute();
  return { formulaId: f.id };
}

/** 分解碎片换配方精华：主 ×essenceMain、辅 ×essenceSub */
export async function decomposeFormula(
  o: Op,
  b: { formulaId: number; part: 'main' | 'sub'; num: number },
): Promise<{ essence: number }> {
  const f = formulaOf(o, b.formulaId);
  const row = await rowOf(o, f.id);
  const have = b.part === 'main' ? (row?.main_num ?? 0) : (row?.sub_num ?? 0);
  if (have < b.num) throw fragmentShort(b.part, f.id, b.num, have);
  await o.tx
    .updateTable('rest_formula')
    .set(b.part === 'main' ? { main_num: have - b.num } : { sub_num: have - b.num })
    .where('rest_id', '=', o.rest.id)
    .where('formula_id', '=', f.id)
    .execute();
  const t = o.tuning.yard;
  const essence = b.num * (b.part === 'main' ? t.essenceMain : t.essenceSub);
  await grantGoodsOp(o, GOODS.formulaEssence, essence);
  return { essence };
}

/** 合成（规格书 08 §8.5）：体力 3×份、菜篮主料、橱柜辅料和添加料；额外产出见 composeExtra */
export async function composeFormula(
  o: Op,
  b: { formulaId: number; num: number },
): Promise<ComposeResultDto> {
  const f = formulaOf(o, b.formulaId);
  const row = await rowOf(o, f.id);
  if (!row?.learned) throw invalidState('formula_unlearned');
  const t = o.tuning.yard;
  spendStrength(o, t.composeStrength * b.num);
  await subBasket(o, f.mainFoodsId, b.num);
  await subFoods(o, f.subFoodsId, b.num);
  await subFoods(o, f.addFoodsId, b.num);
  const { rate: luck } = await opLuck(o);
  const tear = (await hasValidHonor(o, GOODS.starTear))
    ? (o.config.requireGoods(GOODS.starTear).effects.formulaFoodsRate ?? 0)
    : null;
  const extra = composeExtra(b.num, luck, tear, o.rng, t);
  await addFoods(o, f.resFoodsId, b.num + extra);
  await emitAction(o, 'formula.compose', b.num);
  return { foodsId: f.resFoodsId, num: b.num + extra, extra };
}

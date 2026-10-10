import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 服务端发道具的地方（backlog 道具整理工具审查：街道勋章曾经漏在引用收集外面，工具误报“没有来源”）。
 * 写 GOODS.xxx 常量的都自动算“代码里用到”（itemRefs 的 CODE_GOODS），不用管；
 * 道具编号来自变量的列在下面，每处写明道具整理工具（items/analyze.ts、config 的 itemRefs）里对应的来源。
 * 这条测试挂了：说明加了（或改了）发道具的地方——先确认整理工具能把这些道具算成有来源，再更新这张表。
 * 只扫 grantGoodsOp / grantGoods 本身；经别的函数转一道的（extendHonor、openGift 的礼包内容）由调用处或礼包配置负责。
 */
const KNOWN: Record<string, string[]> = {
  // 配置里的奖励（任务、活跃、竞猜、新手码……）：itemRefs 的 award()
  'modules/award/award.ts': ['g.id', 'x.id'],
  // 随机奖励物品池（awardFlag）
  'modules/award/random.ts': ['id'],
  // 老虎机奖项：itemRefs 的 slotAwards
  'modules/bar/slot.ts': ['a.itemId'],
  // 拆下的宝石（原来就有）、宝石升阶：道具的 gem.nextId
  'modules/equip/service.ts': ['g.gem_goods_id', 'gem.nextId'],
  // 后台给论坛帖子发奖、后台邮件：后台填的道具
  'modules/forum/admin.ts': ['goodsId'],
  'modules/mail/reward.ts': ['g.id'],
  // 好友周榜：代码常量 AWARDS（都是 GOODS 常量）
  'modules/friend/weekly.ts': ['goodsId'],
  // 嘻哈周卡（weeklyCards）和工资：区服数值（tuningRefs）
  'modules/hiphop/weekly.ts': ['goodsId', 'wages.get(h.goods_id)!'],
  // 发展基金勋章：FUND 常量（CODE_GOODS）
  'modules/fund/service.ts': ['a.medal'],
  // 食材理财的街市补给包：区服数值 wealth.terms（tuningRefs）
  'modules/wealth/service.ts': ['a.goods_id'],
  // 搬家发新街道的勋章：itemRefs 的“搬家（街道勋章）”
  'modules/growth/service.ts': ['o.config.streetMedalId(streetId)'],
  // 延长勋章（extendHonor，由调用方传入，调用处都是 GOODS 常量）
  'modules/interact/honor.ts': ['goodsId'],
  // 一番赏签：GOODS 常量
  'modules/kuji/service.ts': ['ticketOf(line)'],
  // 特色菜冠军奖：区服数值 mysterious.championGoodsId
  'modules/mysterious/jobs.ts': ['tuning.mysterious.championGoodsId'],
  // 特色菜碎片：GOODS.fragmentBase + 等级（CODE_GOODS 的范围）；碎片兑换
  'modules/mysterious/lesson.ts': ['GOODS.fragmentBase + mc.level'],
  'modules/mysterious/service.ts': ['goodsId'], // 同样是 GOODS.fragmentBase + 等级
  // 开店礼物：itemRefs 的 restaurantDefaults.giftGoods
  'modules/restaurant/service.ts': ['gift.id'],
  // 结算掉落：GOODS.dtTicket、GOODS.krabCoin（settle.ts）
  'modules/settlement/runner.ts': ['drop.goodsId'],
  // 商店、特价、黑市
  'modules/shop/service.ts': ['g.id', 'g.id', 'g.id'],
  // 道具使用后换成别的道具：道具的 use.targetGoods
  'modules/store/use.ts': ['use.targetGoods'],
  // 外卖奖励（pickAward，区服数值）、顾客卡（customer.success / fail，区服数值）
  'modules/takeaway/claim.ts': ['id', 'customer'],
  // 神殿试炼两种药水（GOODS 常量）
  'modules/temple/trial.ts': ['b.way === 1 ? GOODS.creativePotion : GOODS.meditation'],
  // 厨塔声望商店、长老掉落（层的 elder.drops，itemRefs 的“厨塔长老”）
  'modules/tower/shop.ts': ['goodsId'],
  'modules/tower/tower.ts': ['id'],
  // 星愿（itemRefs 的 bless）、镇长兑换（goodsExchange）
  'modules/town/bless.ts': ['b.goodsId!'],
  'modules/town/exchange.ts': ['e.goodsId'],
  // 摇一摇彩蛋：GOODS.krabBurger、GOODS.krabCoin（rules.ts，数量来自区服数值）
  'modules/town/shake.ts': ['egg.goodsId'],
  // 雷神锤、镇长、和 NPC 聊天：按条件二选一的 GOODS 常量
  'modules/town/hammer.ts': ['gift'],
  'modules/town/mayor.ts': ['goodsId'],
  'modules/town/talk.ts': ['goodsId'],
};

const ROOT = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'sim' ? [] : walk(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

/** 每个文件里 grantGoodsOp(op, 编号, …) 和 grantGoods(tx, config, 店, 编号, …) 的“编号”那一项 */
function grantSites(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of walk(ROOT)) {
    const file = relative(ROOT, p).replace(/\\/g, '/');
    // 包装函数本身不算
    if (file === 'modules/store/goods.ts' || file === 'modules/store/grant.ts') continue;
    const src = readFileSync(p, 'utf8');
    // 每处调用都要认得出编号那一项；认不出（第一个参数写法特殊、带泛型等）就报出来，免得新调用静默漏掉
    const calls = [...src.matchAll(/\bgrantGoods(Op)?\s*(<[^>]*>)?\s*\(/g)].filter(
      (m) => !/function\s+$/.test(src.slice(Math.max(0, m.index - 20), m.index)),
    ).length;
    const parsed =
      [...src.matchAll(/\bgrantGoodsOp\(\s*[\w.]+,\s*([^,]+?),/g)].length +
      [...src.matchAll(/\bgrantGoods\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([^,]+?),/g)].length;
    if (calls !== parsed) {
      out[file] = [`认不出 ${calls - parsed} 处调用的编号，改测试的正则`];
      continue;
    }
    const ids = [
      ...[...src.matchAll(/\bgrantGoodsOp\(\s*[\w.]+,\s*([^,]+?),/g)].map((m) => m[1]!),
      ...[...src.matchAll(/\bgrantGoods\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([^,]+?),/g)].map((m) => m[1]!),
    ]
      .map((x) => x.replace(/\s+/g, ' ').trim())
      .filter((x) => !/^GOODS\.\w+$/.test(x));
    if (ids.length > 0) out[file] = ids;
  }
  return out;
}

describe('发道具的地方都在道具整理工具的来源里（backlog 道具整理工具审查）', () => {
  it('编号来自变量的发放处和清单一致；新加的要先确认整理工具能算到来源', () => {
    expect(grantSites()).toEqual(KNOWN);
  });
});

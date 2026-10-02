<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { GuideCodeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { rewardSummary } from '../utils/reward';

/** 游玩指引（问题记录 150）：内容写在这里，改了要发版；新手码从服务端读状态 */
const session = useSessionStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const codes = ref<GuideCodeDto[]>([]);
const busy = ref(false);
const hasRest = computed(() => Boolean(session.me?.restaurantId));

async function load() {
  if (!hasRest.value) return;
  codes.value = await endpoints.guideCodes();
}
async function take(code: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await endpoints.redeem(code);
    toast.push(`领取成功：${rewardSummary(r.items, catalog)}`, 'success');
  } catch (e) {
    toast.push(errorMessage(e, '领取失败'), 'danger');
  } finally {
    busy.value = false;
    await load().catch(() => undefined);
  }
}
onMounted(() => {
  void catalog.load().catch(() => undefined);
  load().catch((e) => toast.push(errorMessage(e, '读取新手码失败'), 'danger'));
});

const DAILY = [
  { to: '/', text: '首页签到：每天一次，送一个签到礼包' },
  { to: '/rest/tasks', text: '任务与活跃：做日常任务攒活跃度，领活跃奖励' },
  { to: '/town', text: '广场：大胃哥、雯姐、13 哥每天各聊一次有礼物；回答镇长的问题；摇一摇钱树' },
  { to: '/yard', text: '菜园：种菜、浇水、除虫除草，熟了及时收，也能去好友家偷菜' },
  { to: '/market', text: '菜场：日常菜场白天每两小时上新，特价菜场每小时上新，高级菜场一天三次' },
  { to: '/bar', text: '酒吧：每天有几次小游戏，记忆调酒和飞镖都有奖励' },
  { to: '/tower', text: '厨塔：挑战守塔人拿声望，声望能在声望商店换东西' },
  { to: '/takeaway', text: '外卖：接单配送赚银币，骑手也会升级' },
];
</script>

<template>
  <div class="dt-page-title"><h5>游玩指引</h5></div>

  <details open class="mb-2" data-testid="guide-codes">
    <summary class="dt-section">新手兑换码</summary>
    <p v-if="!hasRest" class="small text-muted mb-1">进入区服、开店后可以领。每家店每个码领一次。</p>
    <template v-else>
      <p class="small text-muted mb-1">每家店每个码领一次，等级够了就能领。</p>
      <div v-for="c in codes" :key="c.code" class="dt-item">
        <div class="dt-item-main">
          <div>
            <b>{{ c.code }}</b> <span class="small text-muted">{{ c.minLevel }} 级可领</span>
          </div>
          <div class="dt-meta">{{ rewardSummary(c.items, catalog) }}</div>
        </div>
        <div class="dt-item-actions">
          <button
            v-if="c.state === 'ok'"
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="busy"
            :data-testid="`guide-redeem-${c.code}`"
            @click="take(c.code)"
          >
            领取
          </button>
          <span v-else-if="c.state === 'level'" class="small text-muted">{{ c.minLevel }} 级可领</span>
          <span v-else-if="c.state === 'used'" class="small text-success">已领</span>
          <span v-else class="small text-muted">已结束</span>
        </div>
      </div>
    </template>
  </details>

  <details open class="mb-2" data-testid="guide-start">
    <summary class="dt-section">开店第一天</summary>
    <ul class="small ps-3 mb-1">
      <li>
        餐厅会自己营业：每过一轮结算一次，按餐桌来客人。餐桌越多、学会的菜越多、菜谱品级越高，收入和经验越高。
      </li>
      <li>营业要耗油，油用完就停业，记得在首页加油。</li>
      <li>
        食材用来学食谱、做特色菜和接外卖，去<RouterLink to="/market">菜场</RouterLink
        >买，买之前看看橱柜还有没有空位。
      </li>
      <li>体力每轮自然恢复。学特色菜、挑战厨塔、打蟑螂等都要花体力，体力卡可以补。</li>
      <li>
        先做这几件事：到<RouterLink to="/rest/equip">厨具与加点</RouterLink
        >把属性点加上，在首页加油，在<RouterLink to="/cookbooks">食谱</RouterLink>里学新菜，回首页签到。
      </li>
      <li>升星、搬家、改名都在<RouterLink to="/society">协会</RouterLink>里办。</li>
    </ul>
  </details>

  <details class="mb-2" data-testid="guide-daily">
    <summary class="dt-section">每天的固定事项</summary>
    <ul class="small ps-3 mb-1">
      <li v-for="d in DAILY" :key="d.to">
        <RouterLink :to="d.to">{{ d.text }}</RouterLink>
      </li>
    </ul>
  </details>

  <details class="mb-2" data-testid="guide-faq">
    <summary class="dt-section">常见问题</summary>
    <ul class="small ps-3 mb-1">
      <li>
        <b>万能食材能换什么？</b>在橱柜里兑换：2 个一级万能食材换 1 个随机二级稀有食材，2 个二级万能食材换 1
        个随机三级稀有食材。三级及以上的万能食材不能换，只能在学食谱时顶替同级缺的那一种食材。
      </li>
      <li><b>厨具怎么变强？</b>强化有一定概率失败；高级厨具有穿戴等级，等级不够穿不上。</li>
      <li>
        <b>街道有什么区别？</b>每条街的街道勋章加成不同，搬家在<RouterLink to="/society">协会</RouterLink
        >里办。
      </li>
      <li>
        <b>店名和公告有什么规矩？</b>不能用 NPC 的名字，不能有辱骂和广告；被举报核实后会被强制改名或清空。
      </li>
      <li><b>兑换码在哪用？</b>"更多 → 其他 → 兑换码"，或者邮箱页最上面的兑换框。</li>
      <li>
        <b>事件预测一定要等开奖吗？</b
        >不用。截止前随时可以把持有的份额按当前价卖出：觉得押错了就卖掉止损，价格涨到满意就卖掉止盈。
      </li>
    </ul>
  </details>

  <details class="mb-2" data-testid="guide-rules">
    <summary class="dt-section">游戏规则</summary>
    <ul class="small ps-3 mb-1">
      <li>禁止一人多号刷资源、在多个账号之间转移资源。</li>
      <li>禁止利用漏洞获利。发现漏洞请到论坛「建议反馈」版告诉管理员，帖子里别写具体做法，也不要利用。</li>
      <li>禁止辱骂、广告、违法和不当内容。看到这类帖子、喇叭、店名、公告可以点举报。</li>
      <li>违规会被封号 1 天、7 天或永久。</li>
      <li>后台的数据统计只是提醒，处罚前会人工核实。</li>
    </ul>
  </details>
</template>

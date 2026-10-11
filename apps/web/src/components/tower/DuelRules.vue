<script setup lang="ts">
import { computed, ref } from 'vue';
import { DUEL_JUDGES, type DuelWeightDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { ATTR_NAMES } from '../../utils/labels';
import DtSheet from '../DtSheet.vue';

/**
 * 赛厨规则（问题记录 396）：厨塔、赛厨榜、好友切磋共用。
 * judgeCount：每局请几位评委（区服数值 tower.duel.judges，接口给）；没给时按默认 5 位写。
 * weights：五项的评分权重（tower.duel.weights）；没给（旧接口）时用文案里写好的那段。
 * 界面改版 P9：收成一行“赛厨规则 ›”，点开从下面弹出
 */
/** 根节点有两个（一行和面板）：外面给的 class 放到那一行上（P9 终审 M6） */
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ judgeCount?: number; weights?: DuelWeightDto[] }>(), {
  judgeCount: 5,
  weights: undefined,
});
const t = useT();
const open = ref(false);
const ATTRS = ['cook', 'cutting', 'fire', 'season'] as const;
/** 五项各看哪些属性：权重大的在前（一样大按厨艺、刀工、火候、调味），0 的不写，特色菜放最后 */
const scoreLines = computed(() => {
  const d = t.value.tower.duel;
  const w = props.weights;
  if (!w || w.length !== d.items.length) return d.rules;
  const parts = w.map((x, i) => {
    const attrs = ATTRS.filter((a) => x[a] > 0)
      .sort((a, b) => x[b] - x[a] || ATTRS.indexOf(a) - ATTRS.indexOf(b))
      .map((a) => ATTR_NAMES[a] ?? a);
    if (x.mc > 0) attrs.push(d.rulesMc);
    // 系数全是 0：这一项只有随机分
    return attrs.length > 0 ? d.rulesPart(d.items[i]!, attrs) : d.rulesNone(d.items[i]!);
  });
  return [d.rulesWeights(parts)];
});
/** 有特色菜那一项（没给权重时默认的说明里也有）：写明不算试炼价值 */
const hasMc = computed(() => {
  const w = props.weights;
  return !w || w.length !== t.value.tower.duel.items.length || w.some((x) => x.mc > 0);
});
const vote = computed(() =>
  t.value.tower.duel.rulesVote(DUEL_JUDGES.length, props.judgeCount, Math.floor(props.judgeCount / 2) + 1),
);
const judges = computed(() => {
  const d = t.value.tower.duel;
  return DUEL_JUDGES.map((j) => ({
    id: j.id,
    text: d.judgeFocus(d.judges[j.id], j.items.map((i) => d.items[i]).join(d.itemSep)),
  }));
});
</script>

<template>
  <div class="dt-card dt-rows-card dt-duel-rules-row" v-bind="$attrs">
    <button type="button" class="dt-row is-link" data-testid="duel-rules" @click="open = true">
      <span class="dt-row-main"
        ><span class="dt-row-title is-strong">{{ t.tower.duel.rulesTitle }}</span
        ><span class="dt-row-sub">{{ t.tower.duel.rulesSub(judgeCount) }}</span></span
      >
    </button>
  </div>
  <DtSheet :open="open" :title="t.tower.duel.rulesTitle" @close="open = false">
    <div class="dt-help" data-testid="duel-rules-body">
      <p v-for="(line, i) in scoreLines" :key="i">{{ line }}</p>
      <p v-if="hasMc" data-testid="duel-rules-mc">{{ t.tower.duel.rulesMcNoTrial }}</p>
      <p>{{ vote }}</p>
      <p>{{ t.tower.duel.rulesJudges }}</p>
      <ul>
        <li v-for="j in judges" :key="j.id" data-testid="duel-rules-judge">{{ j.text }}</li>
      </ul>
    </div>
  </DtSheet>
</template>

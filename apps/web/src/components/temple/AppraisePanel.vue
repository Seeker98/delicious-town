<script setup lang="ts">
import JobCardNote from '../JobCardNote.vue';
import NpcCard from '../NpcCard.vue';
import { computed, onMounted, ref } from 'vue';
import type { AppraiseResultDto, McOverviewDto, McToolDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { clampQty, formatNum } from '../../utils/format';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { appraiseFailText } from '../../utils/serverText';
import DtArt from '../DtArt.vue';
import DtRow from '../DtRow.vue';
import QtySheet from '../QtySheet.vue';

/**
 * 鉴定（界面改版 P9）：饭老道一句话；鉴定道具一行一种（鉴定出几级、成功率、持有），
 * 点“鉴定”弹出数量面板；刚才鉴定的结果列在下面
 */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const o = ref<McOverviewDto | null>(null);
const toolId = ref<number | null>(null);
const times = ref(1);
const results = ref<AppraiseResultDto['results']>([]);
const busy = ref(false);
const open = ref(false);

async function load() {
  o.value = await endpoints.mc();
}
const tool = computed(() => o.value?.tools.find((t) => t.goodsId === toolId.value) ?? null);
/** 鉴定道具怎么获得（问题记录 415：很多玩家以为玉玺、秘方拿不到） */
function howParts(x: McToolDto): string {
  const a = t.value.temple.appraise;
  return [
    x.shopCoin !== null ? a.howShop(formatNum(x.shopCoin)) : '',
    x.blackDiamond !== null ? a.howBlack(x.blackDiamond) : '',
    x.award ? a.howAward : '',
    x.champion ? a.howChampion : '',
  ]
    .filter(Boolean)
    .join(a.howSep);
}
/** 一种道具的说明：鉴定出几级、成功率（100% 写“必成”）、一次最多几张 */
function rangeLine(x: McToolDto): string {
  const a = t.value.temple.appraise;
  return a.range(x.min, x.max, x.rate >= 1 ? a.sure : a.rate(Math.round(x.rate * 100)), x.perNum);
}
const maxTimes = computed(() => Math.min(o.value?.recipes ?? 0, tool.value?.num ?? 0, 99));
const n = computed(() => clampQty(times.value, maxTimes.value));
/** 不能鉴定的原因（问题记录：下拉框里的道具有，按钮却是灰的） */
const blockReason = computed(() => {
  if (!o.value) return '';
  const a = t.value.temple.appraise;
  if (o.value.star < 1) return t.value.temple.needStar(a.what);
  if (o.value.recipes < 1) return a.noRecipe;
  if ((tool.value?.num ?? 0) < 1) return a.noTool;
  return '';
});
const okCount = computed(() => results.value.filter((x) => x.ok).length);

function openTool(id: number) {
  toolId.value = id;
  times.value = 1;
  open.value = true;
}
async function appraise() {
  if (busy.value || toolId.value === null || blockReason.value) return;
  busy.value = true;
  try {
    const r = await endpoints.mcAppraise(toolId.value, n.value);
    results.value = r.results;
    open.value = false;
    toast.push(t.value.temple.appraise.done(r.results.length, r.results.filter((x) => x.ok).length));
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.temple.appraise.failed), 'danger');
  } finally {
    busy.value = false;
  }
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.common.loadFailed), 'danger')));
</script>

<template>
  <!-- 鉴定神秘食谱的 NPC 是饭老道（问题记录 443） -->
  <NpcCard npc="fanDao" />
  <template v-if="o">
    <JobCardNote v-if="o.jobCard" :card="o.jobCard" />
    <div class="dt-block-head">
      <h2 class="dt-block-title">{{ t.temple.appraise.pickTool }}</h2>
      <span class="dt-block-more" data-testid="recipes">{{ t.temple.appraise.recipes(o.recipes) }}</span>
    </div>
    <div class="dt-card dt-rows-card">
      <DtRow
        v-for="x in o.tools"
        strong
        :key="x.goodsId"
        class="dt-row-wrap"
        :data-testid="`tool-${x.goodsId}`"
      >
        <template #icon><DtArt :name="catalog.goodsArt(x.goodsId)" :size="28" /></template>
        <template #title>{{ catalog.goodsName(x.goodsId) }}</template>
        <template #sub
          ><span class="d-block">{{ rangeLine(x) }}</span
          ><span class="d-block">{{
            x.num > 0 ? t.temple.appraise.have(x.num) : t.temple.appraise.haveNone(howParts(x))
          }}</span></template
        >
        <template #end>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            :data-testid="`appraise-open-${x.goodsId}`"
            @click="openTool(x.goodsId)"
          >
            {{ t.temple.appraise.what }}
          </button>
        </template>
      </DtRow>
    </div>
    <p class="dt-block-note mt-2">{{ t.temple.appraise.rule }}</p>

    <template v-if="results.length > 0">
      <div class="dt-block-head mt-3">
        <h2 class="dt-block-title">{{ t.temple.appraise.lastTitle(results.length, okCount) }}</h2>
      </div>
      <div class="dt-card dt-rows-card" data-testid="results">
        <template v-for="(r, i) in results" :key="i">
          <DtRow v-if="r.ok">
            <template #icon><DtArt name="res-fragment" :size="22" /></template>
            <template #title
              >{{ t.temple.appraise.got(catalog.mcName(r.mcId ?? 0), r.num ?? 0)
              }}<span
                v-if="(catalog.mc(r.mcId ?? 0)?.level ?? 0) >= 2"
                :class="['dt-tag', 'dt-lv', (catalog.mc(r.mcId ?? 0)?.level ?? 0) >= 3 ? 'is-t3' : 'is-t2']"
                >{{ t.temple.appraise.level(catalog.mc(r.mcId ?? 0)?.level ?? 0) }}</span
              ></template
            >
          </DtRow>
          <div v-else class="dt-row dt-appraise-fail">{{ appraiseFailText(r) }}</div>
        </template>
      </div>
    </template>
  </template>

  <QtySheet
    v-if="tool && o"
    v-model="times"
    :open="open"
    :title="catalog.goodsName(tool.goodsId)"
    :art="catalog.goodsArt(tool.goodsId)"
    :lines="[rangeLine(tool), t.temple.appraise.have(tool.num)]"
    :label="t.temple.appraise.howMany"
    :max="maxTimes"
    :ok-text="t.temple.appraise.btn(n)"
    :busy="busy"
    :reason="blockReason"
    :sum="[
      [t.temple.appraise.cost, t.temple.appraise.costItems(n, catalog.goodsName(tool.goodsId)), true],
      [
        t.temple.appraise.after,
        t.temple.appraise.afterItems(
          Math.max(0, o.recipes - n),
          catalog.goodsName(tool.goodsId),
          Math.max(0, tool.num - n),
        ),
      ],
    ]"
    testid="times"
    @close="open = false"
    @ok="appraise"
  >
    <p v-if="howParts(tool)" class="dt-detail-note" data-testid="tool-how">
      {{ t.temple.appraise.how(howParts(tool)) }}
    </p>
  </QtySheet>
</template>

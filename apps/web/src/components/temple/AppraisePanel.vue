<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AppraiseResultDto, McOverviewDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { formatNum } from '../../utils/format';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { appraiseFailText } from '../../utils/serverText';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const o = ref<McOverviewDto | null>(null);
const toolId = ref<number | null>(null);
const times = ref(1);
const noRetry = ref(false);
const results = ref<AppraiseResultDto['results']>([]);
const busy = ref(false);

async function load() {
  o.value = await endpoints.mc();
  if (toolId.value === null)
    toolId.value = o.value.tools.find((t) => t.num > 0)?.goodsId ?? o.value.tools[0]?.goodsId ?? null;
}
const tool = computed(() => o.value?.tools.find((t) => t.goodsId === toolId.value) ?? null);
/** 选中的鉴定道具怎么获得（问题记录 415：很多玩家以为玉玺、秘方拿不到） */
const howText = computed(() => {
  const x = tool.value;
  if (!x) return '';
  const a = t.value.temple.appraise;
  const parts = [
    x.shopCoin !== null ? a.howShop(formatNum(x.shopCoin)) : '',
    x.blackDiamond !== null ? a.howBlack(x.blackDiamond) : '',
    x.award ? a.howAward : '',
    x.champion ? a.howChampion : '',
    x.guardian ? a.howGuardian : '',
  ].filter(Boolean);
  return parts.length > 0 ? a.how(parts.join(a.howSep)) : '';
});
const maxTimes = computed(() => Math.min(o.value?.recipes ?? 0, tool.value?.num ?? 0, 99));
const n = computed(() => Math.max(1, Math.min(times.value || 1, maxTimes.value)));
/** 按钮灰掉的原因（问题记录：下拉框里的道具有，按钮却是灰的） */
const blockReason = computed(() => {
  if (!o.value) return '';
  const a = t.value.temple.appraise;
  if (o.value.star < 1) return t.value.temple.needStar(a.what);
  if (o.value.recipes < 1) return a.noRecipe;
  if ((tool.value?.num ?? 0) < 1) return a.noTool;
  return '';
});

async function appraise() {
  if (busy.value || toolId.value === null) return;
  busy.value = true;
  try {
    const r = await endpoints.mcAppraise(toolId.value, n.value, noRetry.value);
    results.value = r.results;
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
  <div v-if="o">
    <h6>{{ t.temple.appraise.title }}</h6>
    <p class="small text-muted">
      {{ t.temple.appraise.rule(o.recipes) }}
    </p>
    <select v-model.number="toolId" class="form-select form-select-sm mb-1" data-testid="tool">
      <option v-for="x in o.tools" :key="x.goodsId" :value="x.goodsId">
        {{
          t.temple.appraise.toolOption(
            catalog.goodsName(x.goodsId),
            x.min,
            x.max,
            Math.round(x.rate * 100),
            x.num,
          )
        }}
      </option>
    </select>
    <div v-if="howText" class="small text-muted mb-1" data-testid="tool-how">{{ howText }}</div>
    <div class="d-flex gap-1 align-items-center mb-1">
      <input
        v-model.number="times"
        type="number"
        min="1"
        :max="Math.max(1, maxTimes)"
        class="form-control form-control-sm"
        style="width: 80px"
        data-testid="times"
      />
      <button
        class="btn btn-sm btn-primary"
        data-testid="appraise"
        :disabled="busy || maxTimes < 1 || o.star < 1"
        @click="appraise"
      >
        {{ t.temple.appraise.btn(n) }}
      </button>
    </div>
    <div v-if="blockReason" class="small text-danger mb-1" data-testid="appraise-block">
      {{ blockReason }}
    </div>
    <label v-if="o.starBook" class="small d-block">
      <input v-model="noRetry" type="checkbox" class="form-check-input me-1" data-testid="no-retry" />{{
        t.temple.appraise.noRetry
      }}
    </label>
    <ul class="small mt-2" data-testid="results">
      <li v-for="(r, i) in results" :key="i">
        {{
          r.ok
            ? t.temple.appraise.got(catalog.mcName(r.mcId ?? 0), r.num ?? 0, !!r.blessed)
            : appraiseFailText(r)
        }}
      </li>
    </ul>
  </div>
</template>

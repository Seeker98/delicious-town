<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AppraiseResultDto, McOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
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
const maxTimes = computed(() => Math.min(o.value?.recipes ?? 0, tool.value?.num ?? 0, 99));
const n = computed(() => Math.max(1, Math.min(times.value || 1, maxTimes.value)));

async function appraise() {
  if (busy.value || toolId.value === null) return;
  busy.value = true;
  try {
    const r = await endpoints.mcAppraise(toolId.value, n.value, noRetry.value);
    results.value = r.results;
    toast.push(`鉴定 ${r.results.length} 次，成功 ${r.results.filter((x) => x.ok).length} 次`);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '鉴定失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取失败'), 'danger')));
</script>

<template>
  <div v-if="o">
    <h5>神殿</h5>
    <h6>鉴定神秘食谱</h6>
    <p class="small text-muted">
      每次消耗 1 个神秘食谱和 1 个鉴定道具，成功得到残卷。持有神秘食谱 {{ o.recipes }} 个。
      <span v-if="o.star < 1">1 星以后才能鉴定。</span>
    </p>
    <select v-model.number="toolId" class="form-select form-select-sm mb-1" data-testid="tool">
      <option v-for="t in o.tools" :key="t.goodsId" :value="t.goodsId">
        {{ catalog.goodsName(t.goodsId) }}（{{ t.min }}~{{ t.max }} 级，{{ Math.round(t.rate * 100) }}%，持有
        {{ t.num }}）
      </option>
    </select>
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
        鉴定 ×{{ n }}
      </button>
    </div>
    <label v-if="o.starBook" class="small d-block">
      <input v-model="noRetry" type="checkbox" class="form-check-input me-1" data-testid="no-retry" />低于 5
      级不重抽（星神之书）
    </label>
    <ul class="small mt-2" data-testid="results">
      <li v-for="(r, i) in results" :key="i">
        {{
          r.ok
            ? `得到 ${catalog.mcName(r.mcId ?? 0)} 残卷 ×${r.num}${r.blessed ? '（星神眷恋）' : ''}`
            : r.text
        }}
      </li>
    </ul>
    <p class="small text-muted mt-3">守护兽、探险、试炼和克拉肯稍后开放。</p>
  </div>
</template>

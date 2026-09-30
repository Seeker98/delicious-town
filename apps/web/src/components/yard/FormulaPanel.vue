<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { FormulaAppraiseResultDto, FormulaDto, FormulasDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<FormulasDto | null>(null);
const busy = ref(false);
const toolId = ref<number>(0);
const times = ref(1);
const results = ref<FormulaAppraiseResultDto['results']>([]);
const composeNums = ref<Record<number, number>>({});

async function load() {
  try {
    data.value = await endpoints.formulas();
    if (!toolId.value)
      toolId.value = data.value.tools.find((x) => x.num > 0)?.goodsId ?? data.value.tools[0]?.goodsId ?? 0;
  } catch (e) {
    toast.push(errorMessage(e, '读取配方失败'), 'danger');
  }
}
onMounted(load);

const tool = computed(() => data.value?.tools.find((x) => x.goodsId === toolId.value));
const maxTimes = computed(() => Math.min(tool.value?.num ?? 0, data.value?.scrolls ?? 0, 99));
const n = computed(() => Math.max(1, Math.min(times.value || 1, maxTimes.value)));
const appraiseBlock = computed(() => {
  if (!data.value) return '';
  if (data.value.scrolls < 1) return '没有玄奥配方：每次鉴定要 1 个玄奥配方和 1 个鉴定道具（厨神玉玺）';
  if ((tool.value?.num ?? 0) < 1) return '没有这个鉴定道具';
  return '';
});
const nameOf = (id: number) => data.value?.formulas.find((f) => f.id === id)?.name ?? `配方${id}`;
const owned = computed(() =>
  (data.value?.formulas ?? []).filter((f) => f.learned || f.mainNum + f.subNum > 0),
);
const learned = computed(() => (data.value?.formulas ?? []).filter((f) => f.learned));

function learnBlock(f: FormulaDto): string {
  if (f.learned) return '已学会';
  if (f.mainNum < 1) return '缺主碎片';
  if (f.subNum < 1) return '缺辅碎片';
  return '';
}
function composeBlock(f: FormulaDto): string {
  if (f.maxCompose >= 1) return '';
  if (f.have.main < 1) return `菜篮里没有${catalog.foodName(f.mainFoodsId)}（主料）`;
  if (f.have.sub < 1) return `橱柜里没有${catalog.foodName(f.subFoodsId)}（辅料）`;
  if (f.have.add < 1) return `橱柜里没有${catalog.foodName(f.addFoodsId)}（添加料）`;
  return `体力不够（每份 ${data.value?.composeStrength ?? 3}）`;
}
const composeN = (f: FormulaDto) => Math.max(1, Math.min(composeNums.value[f.id] || 1, f.maxCompose));

async function run(fn: () => Promise<unknown>, ok: string | null, fail: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    if (ok) toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fail), 'danger');
  } finally {
    busy.value = false;
  }
}
const appraise = () =>
  run(
    async () => {
      const r = await endpoints.formulaAppraise(toolId.value, n.value);
      results.value = r.results;
      toast.push(`鉴定 ${r.results.length} 次，成功 ${r.results.filter((x) => x.ok).length} 次`);
    },
    null,
    '鉴定失败',
  );
</script>

<template>
  <div v-if="data" class="small">
    <h6>鉴定配方</h6>
    <div class="d-flex gap-1 align-items-center mb-1">
      <select v-model.number="toolId" class="form-select form-select-sm" data-testid="appraise-tool">
        <option v-for="x in data.tools" :key="x.goodsId" :value="x.goodsId">
          {{ catalog.goodsName(x.goodsId) }}（{{ x.num }}，成功率 {{ Math.round(x.rate * 100) }}%）
        </option>
      </select>
      <input
        v-model.number="times"
        type="number"
        min="1"
        :max="Math.max(1, maxTimes)"
        class="form-control form-control-sm"
        style="width: 70px"
        data-testid="appraise-times"
      />
      <button
        class="btn btn-sm btn-primary text-nowrap"
        :disabled="busy || !!appraiseBlock"
        data-testid="appraise-go"
        @click="appraise"
      >
        鉴定 ×{{ n }}
      </button>
    </div>
    <div class="text-muted mb-1">玄奥配方 {{ data.scrolls }}；成功时 25% 得主碎片，其余得辅碎片</div>
    <div v-if="appraiseBlock" class="text-danger mb-1" data-testid="appraise-block">{{ appraiseBlock }}</div>
    <ul v-if="results.length > 0" class="mb-2" data-testid="appraise-results">
      <li v-for="(r, i) in results" :key="i">
        <template v-if="r.ok">
          {{ nameOf(r.formulaId ?? 0) }} {{ r.part === 'main' ? '主' : '辅' }}碎片{{
            r.upgraded ? '（星月密卷）' : ''
          }}
        </template>
        <template v-else>失败</template>
      </li>
    </ul>

    <h6>我的配方</h6>
    <div v-if="owned.length === 0" class="text-muted mb-2">还没有配方碎片，先鉴定</div>
    <div
      v-for="f in owned"
      :key="f.id"
      class="border rounded p-1 mb-1 d-flex flex-wrap gap-1 align-items-center"
      :data-testid="`formula-${f.id}`"
    >
      <span class="me-auto">
        {{ f.name }}
        <span v-if="f.learned" class="badge text-bg-success">已学会</span>
        <span class="text-muted">主碎片 {{ f.mainNum }} / 辅碎片 {{ f.subNum }}</span>
      </span>
      <button
        v-if="!f.learned"
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || !!learnBlock(f)"
        :title="learnBlock(f)"
        :data-testid="`learn-${f.id}`"
        @click="run(() => endpoints.formulaLearn(f.id), `学会了${f.name}`, '学习失败')"
      >
        学习{{ learnBlock(f) ? `（${learnBlock(f)}）` : '' }}
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy || f.mainNum < 1"
        :data-testid="`decompose-main-${f.id}`"
        @click="run(() => endpoints.formulaDecompose(f.id, 'main', 1), '分解了 1 个主碎片', '分解失败')"
      >
        分解主碎片
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy || f.subNum < 1"
        :data-testid="`decompose-sub-${f.id}`"
        @click="run(() => endpoints.formulaDecompose(f.id, 'sub', 1), '分解了 1 个辅碎片', '分解失败')"
      >
        分解辅碎片
      </button>
    </div>

    <h6 class="mt-2">合成</h6>
    <div v-if="learned.length === 0" class="text-muted">学会配方后可以合成食材</div>
    <div v-for="f in learned" :key="f.id" class="border rounded p-1 mb-1">
      <div>
        {{ f.name }}：{{ catalog.foodName(f.mainFoodsId) }}（菜篮 {{ f.have.main }}）+
        {{ catalog.foodName(f.subFoodsId) }}（橱柜 {{ f.have.sub }}）+
        {{ catalog.foodName(f.addFoodsId) }}（橱柜 {{ f.have.add }}）→ {{ catalog.foodName(f.resFoodsId) }}
      </div>
      <div class="d-flex gap-1 align-items-center mt-1">
        <input
          v-model.number="composeNums[f.id]"
          type="number"
          min="1"
          :max="Math.max(1, f.maxCompose)"
          class="form-control form-control-sm"
          style="width: 70px"
          :data-testid="`compose-num-${f.id}`"
        />
        <button
          class="btn btn-sm btn-primary text-nowrap"
          :disabled="busy || !!composeBlock(f)"
          :data-testid="`compose-${f.id}`"
          @click="run(() => endpoints.formulaCompose(f.id, composeN(f)), '合成成功', '合成失败')"
        >
          合成 ×{{ composeN(f) }}（体力 {{ composeN(f) * data.composeStrength }}）
        </button>
      </div>
      <div v-if="composeBlock(f)" class="text-danger" :data-testid="`compose-block-${f.id}`">
        {{ composeBlock(f) }}
      </div>
    </div>
  </div>
</template>

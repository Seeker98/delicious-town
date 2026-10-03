<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { FormulaAppraiseResultDto, FormulaDto, FormulasDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
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
    toast.push(errorMessage(e, t.value.yard.formula.loadFailed), 'danger');
  }
}
onMounted(load);

const tool = computed(() => data.value?.tools.find((x) => x.goodsId === toolId.value));
const maxTimes = computed(() => Math.min(tool.value?.num ?? 0, data.value?.scrolls ?? 0, 99));
const n = computed(() => Math.max(1, Math.min(times.value || 1, maxTimes.value)));
const appraiseBlock = computed(() => {
  if (!data.value) return '';
  if (data.value.scrolls < 1) return t.value.yard.formula.noScroll;
  if ((tool.value?.num ?? 0) < 1) return t.value.yard.formula.noTool;
  return '';
});
const nameOf = (id: number) =>
  data.value?.formulas.find((f) => f.id === id)?.name ?? t.value.yard.formula.nameFallback(id);
const owned = computed(() =>
  (data.value?.formulas ?? []).filter((f) => f.learned || f.mainNum + f.subNum > 0),
);
const learned = computed(() => (data.value?.formulas ?? []).filter((f) => f.learned));

function learnBlock(f: FormulaDto): string {
  const x = t.value.yard.formula;
  if (f.learned) return x.learned;
  if (f.mainNum < 1) return x.noMain;
  if (f.subNum < 1) return x.noSub;
  return '';
}
function composeBlock(f: FormulaDto): string {
  if (f.maxCompose >= 1) return '';
  const x = t.value.yard.formula;
  if (f.have.main < 1) return x.noMainFood(catalog.foodName(f.mainFoodsId));
  if (f.have.sub < 1) return x.noSubFood(catalog.foodName(f.subFoodsId));
  if (f.have.add < 1) return x.noAddFood(catalog.foodName(f.addFoodsId));
  return x.noStrength(data.value?.composeStrength ?? 3);
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
      toast.push(t.value.yard.appraiseDone(r.results.length, r.results.filter((x) => x.ok).length));
    },
    null,
    t.value.yard.formula.appraiseFailed,
  );
</script>

<template>
  <div v-if="data" class="small">
    <h6>{{ t.yard.formula.appraiseTitle }}</h6>
    <div class="d-flex gap-1 align-items-center mb-1">
      <select v-model.number="toolId" class="form-select form-select-sm" data-testid="appraise-tool">
        <option v-for="x in data.tools" :key="x.goodsId" :value="x.goodsId">
          {{ t.yard.formula.toolOption(catalog.goodsName(x.goodsId), x.num, Math.round(x.rate * 100)) }}
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
        {{ t.yard.formula.appraise(n) }}
      </button>
    </div>
    <div class="text-muted mb-1">{{ t.yard.formula.scrolls(data.scrolls) }}</div>
    <div v-if="appraiseBlock" class="text-danger mb-1" data-testid="appraise-block">{{ appraiseBlock }}</div>
    <ul v-if="results.length > 0" class="mb-2" data-testid="appraise-results">
      <li v-for="(r, i) in results" :key="i">
        <template v-if="r.ok">
          {{ t.yard.formula.piece(nameOf(r.formulaId ?? 0), r.part === 'main', !!r.upgraded) }}
        </template>
        <template v-else>{{ t.yard.formula.fail }}</template>
      </li>
    </ul>

    <h6>{{ t.yard.formula.mine }}</h6>
    <div v-if="owned.length === 0" class="text-muted mb-2">{{ t.yard.formula.none }}</div>
    <div
      v-for="f in owned"
      :key="f.id"
      class="border rounded p-1 mb-1 d-flex flex-wrap gap-1 align-items-center"
      :data-testid="`formula-${f.id}`"
    >
      <span class="me-auto">
        {{ catalog.data('formulas', f.id)?.name ?? f.name }}
        <span v-if="f.learned" class="badge text-bg-success ms-1">{{ t.yard.formula.learned }}</span>
        <span class="text-muted ms-1">{{ t.yard.formula.pieces(f.mainNum, f.subNum) }}</span>
      </span>
      <button
        v-if="!f.learned"
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || !!learnBlock(f)"
        :title="learnBlock(f)"
        :data-testid="`learn-${f.id}`"
        @click="
          run(
            () => endpoints.formulaLearn(f.id),
            t.yard.formula.learnedName(f.name),
            t.yard.formula.learnFailed,
          )
        "
      >
        {{ t.yard.formula.learn(learnBlock(f)) }}
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy || f.mainNum < 1"
        :data-testid="`decompose-main-${f.id}`"
        @click="
          run(
            () => endpoints.formulaDecompose(f.id, 'main', 1),
            t.yard.formula.decomposedMain,
            t.yard.formula.decomposeFailed,
          )
        "
      >
        {{ t.yard.formula.decomposeMain }}
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy || f.subNum < 1"
        :data-testid="`decompose-sub-${f.id}`"
        @click="
          run(
            () => endpoints.formulaDecompose(f.id, 'sub', 1),
            t.yard.formula.decomposedSub,
            t.yard.formula.decomposeFailed,
          )
        "
      >
        {{ t.yard.formula.decomposeSub }}
      </button>
    </div>

    <h6 class="mt-2">{{ t.yard.formula.compose }}</h6>
    <div v-if="learned.length === 0" class="text-muted">{{ t.yard.formula.composeEmpty }}</div>
    <div v-for="f in learned" :key="f.id" class="border rounded p-1 mb-1">
      <div>
        {{
          t.yard.formula.recipe({
            name: catalog.data('formulas', f.id)?.name ?? f.name,
            main: catalog.foodName(f.mainFoodsId),
            haveMain: f.have.main,
            sub: catalog.foodName(f.subFoodsId),
            haveSub: f.have.sub,
            add: catalog.foodName(f.addFoodsId),
            haveAdd: f.have.add,
            res: catalog.foodName(f.resFoodsId),
          })
        }}
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
          @click="
            run(
              () => endpoints.formulaCompose(f.id, composeN(f)),
              t.yard.formula.composed,
              t.yard.formula.composeFailed,
            )
          "
        >
          {{ t.yard.formula.composeBtn(composeN(f), composeN(f) * data.composeStrength) }}
        </button>
      </div>
      <div v-if="composeBlock(f)" class="text-danger" :data-testid="`compose-block-${f.id}`">
        {{ composeBlock(f) }}
      </div>
    </div>
  </div>
</template>

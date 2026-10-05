<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { McOverviewDto, McPreviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { GRADE_NAMES, ROAD_NAMES } from '../utils/labels';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const o = ref<McOverviewDto | null>(null);
const preview = ref<McPreviewDto | null>(null);
const cookie = ref(false);
const qty = reactive<Record<number, number>>({});
const busy = ref(false);

async function load() {
  o.value = await endpoints.mc();
}
async function act(fn: () => Promise<unknown>, ok: string | null, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    if (ok) toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
const dish = (id: number) => catalog.mc(id);
const nameOf = (id: number) => catalog.mcName(id);
/** 填的数超过持有时按持有算 */
const numOf = (mcId: number, max: number) => Math.max(1, Math.min(qty[mcId] ?? 1, max));
const learnedIds = computed(() => new Set(o.value?.learned.map((m) => m.mcId) ?? []));
/** 用残卷学会要 3 张 */
const LEARN_REMNANTS = 3;
/** 等级从高到低，同级按道 */
const byLevel = (a: number, b: number) =>
  (dish(b)?.level ?? 0) - (dish(a)?.level ?? 0) || (dish(a)?.road ?? 0) - (dish(b)?.road ?? 0) || a - b;
const sortedLearned = computed(() => [...(o.value?.learned ?? [])].sort((a, b) => byLevel(a.mcId, b.mcId)));
/** 残卷分三组（问题记录：能学和不能学的混在一起） */
const groups = computed(() => {
  const rs = [...(o.value?.remnants ?? [])].sort((a, b) => byLevel(a.mcId, b.mcId));
  const known = learnedIds.value;
  return [
    {
      key: 'learnable' as const,
      items: rs.filter((r) => !known.has(r.mcId) && r.num >= LEARN_REMNANTS),
    },
    {
      key: 'short' as const,
      items: rs.filter((r) => !known.has(r.mcId) && r.num < LEARN_REMNANTS),
    },
    { key: 'learned' as const, items: rs.filter((r) => known.has(r.mcId)) },
  ].filter((g) => g.items.length > 0);
});
function learnAll() {
  return act(
    async () => {
      const r = await endpoints.mcLearnAll();
      toast.push(t.value.mc.learnedAll(r.learned.length, r.learned.map(nameOf).join(t.value.events.sep)));
    },
    null,
    t.value.mc.learnFailed,
  );
}

async function openCook(mcId: number) {
  try {
    preview.value = await endpoints.mcPreview(mcId);
    cookie.value = false;
  } catch (e) {
    toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
}
function cook(n: number) {
  const p = preview.value;
  if (!p) return;
  return act(
    async () => {
      const r = await endpoints.mcCook(p.mcId, n, cookie.value);
      const extra = [r.levelUp ? t.value.mc.levelUp : '', r.bob ? t.value.mc.bob : '']
        .filter(Boolean)
        .join(t.value.events.sep);
      toast.push(
        t.value.mc.cooked(
          GRADE_NAMES[r.cook.grade] ?? '',
          !!r.cook.luck,
          formatNum(r.cook.totalNum),
          formatNum(r.cook.price),
          extra,
        ),
      );
      preview.value = null;
    },
    null,
    t.value.mc.cookFailed,
  );
}
function dump() {
  if (!window.confirm(t.value.mc.dumpConfirm)) return;
  return act(() => endpoints.mcDump(), t.value.mc.dumped, t.value.mc.dumpFailed);
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.mc.loadFailed), 'danger')));
</script>

<template>
  <div v-if="o">
    <div class="d-flex align-items-center mb-2">
      <h5 class="mb-0 flex-fill">{{ t.mc.title }}</h5>
      <RouterLink to="/temple" class="small me-2">{{ t.mc.temple }}</RouterLink>
      <RouterLink to="/town?tab=classroom" class="small">{{ t.mc.classroom }}</RouterLink>
    </div>
    <p v-if="o.star < 1" class="small text-muted">{{ t.mc.needStar }}</p>

    <div
      v-if="o.current"
      class="border rounded p-2 mb-2 small d-flex align-items-center"
      data-testid="mc-current"
    >
      <div class="flex-fill">
        {{ t.mc.onSale }}<b>{{ nameOf(o.current.mcId) }}</b> {{ GRADE_NAMES[o.current.grade]
        }}{{ o.current.luck ? t.mc.lucky : '' }}
        <div class="text-muted">
          {{
            t.mc.saleMeta(
              formatNum(o.current.leftNum),
              formatNum(o.current.totalNum),
              formatNum(o.current.price),
              o.current.eatCount,
            )
          }}{{ o.saleRate !== null && o.saleRate !== 1 ? t.mc.saleRate(formatNum(o.saleRate)) : '' }}
        </div>
      </div>
      <button class="btn btn-sm btn-outline-danger" data-testid="dump" :disabled="busy" @click="dump">
        {{ t.mc.dump }}
      </button>
    </div>

    <h6 class="dt-section">{{ t.mc.learned(o.learned.length) }}</h6>
    <div v-if="o.learned.length === 0" class="small text-muted mb-2">
      {{ t.mc.noLearned }}
    </div>
    <div
      v-for="m in sortedLearned"
      :key="m.mcId"
      class="border-bottom py-1 small"
      :data-testid="`learned-${m.mcId}`"
    >
      <div class="d-flex align-items-center">
        <div class="flex-fill">
          <b>{{ nameOf(m.mcId) }}</b>
          <span class="text-muted ms-1">
            {{
              t.mc.dishMeta(
                dish(m.mcId)?.level,
                ROAD_NAMES[dish(m.mcId)?.road ?? 0] ?? '',
                catalog.data('proficiency', m.curlevel)?.name ?? m.levelName,
              )
            }}
          </span>
          <div class="progress mt-1" style="height: 6px">
            <div
              class="progress-bar bg-warning"
              :style="{ width: `${m.expNext ? Math.min(100, (m.curexp / m.expNext) * 100) : 100}%` }"
            ></div>
          </div>
          <div class="text-muted">
            {{ t.mc.proficiency(formatNum(m.curexp), m.expNext ? formatNum(m.expNext) : null) }}
          </div>
        </div>
        <button
          class="btn btn-sm btn-primary ms-2"
          :data-testid="`cook-${m.mcId}`"
          :disabled="busy || o.current !== null || o.star < 1"
          @click="openCook(m.mcId)"
        >
          {{ t.mc.cook }}
        </button>
      </div>
      <div
        v-if="preview && preview.mcId === m.mcId"
        class="bg-light rounded p-2 mt-1"
        data-testid="cook-panel"
      >
        <div>
          {{ t.mc.foods
          }}<span v-for="f in preview.foods" :key="f.foodsId" class="me-2"
            >{{ catalog.foodName(f.foodsId) }} {{ f.have }}</span
          >
        </div>
        <label class="d-block my-1">
          <input
            v-model="cookie"
            type="checkbox"
            class="form-check-input me-1"
            data-testid="cookie"
            :disabled="preview.cookies === 0"
          />{{ t.mc.cookie(preview.cookies) }}
        </label>
        <div class="d-flex flex-wrap gap-1">
          <button
            v-for="c in preview.cookNums"
            :key="c.n"
            class="btn btn-sm btn-outline-primary"
            :data-testid="`cooknum-${c.n}`"
            :disabled="busy || !c.ok || (cookie && preview.cookies < c.n)"
            @click="cook(c.n)"
          >
            {{ t.mc.batches(c.n) }}
          </button>
          <button class="btn btn-sm btn-link" @click="preview = null">{{ t.common.cancel }}</button>
        </div>
      </div>
    </div>

    <h6 class="dt-section">{{ t.mc.remnants }}</h6>
    <div v-if="o.remnants.length === 0" class="small text-muted">{{ t.mc.noRemnants }}</div>
    <div v-for="g in groups" :key="g.key" class="mb-2" :data-testid="`group-${g.key}`">
      <div class="d-flex align-items-center small fw-bold text-muted mt-1">
        <span class="flex-fill">{{ t.mc.groupTitle(t.mc.groups[g.key], g.items.length) }}</span>
        <button
          v-if="g.key === 'learnable'"
          class="btn btn-sm btn-success"
          data-testid="learn-all"
          :disabled="busy"
          @click="learnAll"
        >
          {{ t.mc.learnAll }}
        </button>
      </div>
      <div
        v-for="r in g.items"
        :key="r.mcId"
        :class="[
          'd-flex align-items-center gap-1 border-bottom py-1 small',
          { 'bg-success-subtle': g.key === 'learnable' },
        ]"
      >
        <div class="flex-fill">
          <b>{{ nameOf(r.mcId) }}</b> ×{{ r.num }}
          <span class="text-muted">
            {{
              t.mc.remnantMeta(
                dish(r.mcId)?.level,
                ROAD_NAMES[dish(r.mcId)?.road ?? 0] ?? '',
                formatNum(dish(r.mcId)?.coin ?? 0),
              )
            }}
          </span>
          <span v-if="g.key === 'short'" class="text-danger">{{ t.mc.short(LEARN_REMNANTS - r.num) }}</span>
        </div>
        <button
          v-if="g.key === 'learnable'"
          class="btn btn-sm btn-success"
          :data-testid="`learn-${r.mcId}`"
          :disabled="busy"
          @click="act(() => endpoints.mcLearn(r.mcId), t.mc.learnedName(nameOf(r.mcId)), t.mc.learnFailed)"
        >
          {{ t.mc.learn }}
        </button>
        <input
          v-model.number="qty[r.mcId]"
          type="number"
          min="1"
          :max="r.num"
          class="form-control form-control-sm"
          style="width: 60px"
          :data-testid="`remnant-num-${r.mcId}`"
        />
        <button
          class="btn btn-sm btn-outline-secondary"
          :data-testid="`sell-${r.mcId}`"
          :disabled="busy"
          @click="
            act(() => endpoints.mcRemnantSell(r.mcId, numOf(r.mcId, r.num)), t.mc.sold, t.mc.sellFailed)
          "
        >
          {{ t.mc.sell }}
        </button>
        <button
          class="btn btn-sm btn-outline-secondary"
          :data-testid="`decompose-${r.mcId}`"
          :disabled="busy"
          @click="
            act(
              () => endpoints.mcRemnantDecompose(r.mcId, numOf(r.mcId, r.num)),
              t.mc.decomposed,
              t.mc.decomposeFailed,
            )
          "
        >
          {{ t.mc.decompose }}
        </button>
      </div>
    </div>
  </div>
</template>

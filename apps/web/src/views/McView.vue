<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { McOverviewDto, McPreviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { GRADE_NAMES, ROAD_NAMES } from '../utils/labels';

const catalog = useCatalogStore();
const toast = useToastStore();
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
      key: 'learnable',
      title: '可以学习',
      items: rs.filter((r) => !known.has(r.mcId) && r.num >= LEARN_REMNANTS),
    },
    {
      key: 'short',
      title: '残卷不够（3 张学会一道）',
      items: rs.filter((r) => !known.has(r.mcId) && r.num < LEARN_REMNANTS),
    },
    { key: 'learned', title: '已学会的菜（残卷可出售或分解）', items: rs.filter((r) => known.has(r.mcId)) },
  ].filter((g) => g.items.length > 0);
});
function learnAll() {
  return act(
    async () => {
      const r = await endpoints.mcLearnAll();
      toast.push(`学会了 ${r.learned.length} 道特色菜：${r.learned.map(nameOf).join('、')}`);
    },
    null,
    '学习失败',
  );
}

async function openCook(mcId: number) {
  try {
    preview.value = await endpoints.mcPreview(mcId);
    cookie.value = false;
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
function cook(n: number) {
  const p = preview.value;
  if (!p) return;
  return act(
    async () => {
      const r = await endpoints.mcCook(p.mcId, n, cookie.value);
      const extra = [r.levelUp ? '熟练度升级了' : '', r.bob ? '海绵宝宝点了赞' : '']
        .filter(Boolean)
        .join('，');
      toast.push(
        `烹制完成：${GRADE_NAMES[r.cook.grade]}${r.cook.luck ? '（幸运）' : ''} ${formatNum(r.cook.totalNum)} 份，每份 ${formatNum(r.cook.price)} 银币${extra ? `，${extra}` : ''}`,
      );
      preview.value = null;
    },
    null,
    '烹制失败',
  );
}
function dump() {
  if (!window.confirm('倒掉后剩下的份数全部作废，确定吗？')) return;
  return act(() => endpoints.mcDump(), '已倒掉', '倒掉失败');
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取特色菜失败'), 'danger')));
</script>

<template>
  <div v-if="o">
    <div class="d-flex align-items-center mb-2">
      <h5 class="mb-0 flex-fill">特色菜</h5>
      <RouterLink to="/temple" class="small me-2">神殿鉴定</RouterLink>
      <RouterLink to="/classroom" class="small">教室</RouterLink>
    </div>
    <p v-if="o.star < 1" class="small text-muted">1 星以后才能鉴定和烹制特色菜。</p>

    <div
      v-if="o.current"
      class="border rounded p-2 mb-2 small d-flex align-items-center"
      data-testid="mc-current"
    >
      <div class="flex-fill">
        在售：<b>{{ nameOf(o.current.mcId) }}</b> {{ GRADE_NAMES[o.current.grade]
        }}{{ o.current.luck ? '（幸运）' : '' }}
        <div class="text-muted">
          剩余 {{ formatNum(o.current.leftNum) }} / {{ formatNum(o.current.totalNum) }} 份 · 每份
          {{ formatNum(o.current.price) }} 银币 · 被品尝 {{ o.current.eatCount }} 次
        </div>
      </div>
      <button class="btn btn-sm btn-outline-danger" data-testid="dump" :disabled="busy" @click="dump">
        倒掉
      </button>
    </div>

    <h6>已学（{{ o.learned.length }}）</h6>
    <div v-if="o.learned.length === 0" class="small text-muted mb-2">
      还没有学会特色菜：在神殿鉴定神秘食谱得到残卷，3 张残卷就能学会。
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
          <span class="text-muted">
            {{ dish(m.mcId)?.level }} 级 · {{ ROAD_NAMES[dish(m.mcId)?.road ?? 0] }} · {{ m.levelName }}
          </span>
          <div class="progress mt-1" style="height: 6px">
            <div
              class="progress-bar bg-warning"
              :style="{ width: `${m.expNext ? Math.min(100, (m.curexp / m.expNext) * 100) : 100}%` }"
            ></div>
          </div>
          <div class="text-muted">
            熟练度 {{ formatNum(m.curexp) }}{{ m.expNext ? ` / ${formatNum(m.expNext)}` : '（满级）' }}
          </div>
        </div>
        <button
          class="btn btn-sm btn-primary ms-2"
          :data-testid="`cook-${m.mcId}`"
          :disabled="busy || o.current !== null || o.star < 1"
          @click="openCook(m.mcId)"
        >
          烹制
        </button>
      </div>
      <div
        v-if="preview && preview.mcId === m.mcId"
        class="bg-light rounded p-2 mt-1"
        data-testid="cook-panel"
      >
        <div>
          食材：<span v-for="f in preview.foods" :key="f.foodsId" class="me-2"
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
          />用幸运饼干（每批 1 个，持有 {{ preview.cookies }}）
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
            {{ c.n }} 批
          </button>
          <button class="btn btn-sm btn-link" @click="preview = null">取消</button>
        </div>
      </div>
    </div>

    <h6 class="mt-3">残卷</h6>
    <div v-if="o.remnants.length === 0" class="small text-muted">没有残卷</div>
    <div v-for="g in groups" :key="g.key" class="mb-2" :data-testid="`group-${g.key}`">
      <div class="d-flex align-items-center small fw-bold text-muted mt-1">
        <span class="flex-fill">{{ g.title }}（{{ g.items.length }}）</span>
        <button
          v-if="g.key === 'learnable'"
          class="btn btn-sm btn-success"
          data-testid="learn-all"
          :disabled="busy"
          @click="learnAll"
        >
          全部学会
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
            {{ dish(r.mcId)?.level }} 级 · {{ ROAD_NAMES[dish(r.mcId)?.road ?? 0] }} · 单价
            {{ formatNum(dish(r.mcId)?.coin ?? 0) }}
          </span>
          <span v-if="g.key === 'short'" class="text-danger"> · 还差 {{ LEARN_REMNANTS - r.num }} 张</span>
        </div>
        <button
          v-if="g.key === 'learnable'"
          class="btn btn-sm btn-success"
          :data-testid="`learn-${r.mcId}`"
          :disabled="busy"
          @click="act(() => endpoints.mcLearn(r.mcId), `学会了${nameOf(r.mcId)}`, '学习失败')"
        >
          学习
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
          @click="act(() => endpoints.mcRemnantSell(r.mcId, numOf(r.mcId, r.num)), '已出售', '出售失败')"
        >
          出售
        </button>
        <button
          class="btn btn-sm btn-outline-secondary"
          :data-testid="`decompose-${r.mcId}`"
          :disabled="busy"
          @click="act(() => endpoints.mcRemnantDecompose(r.mcId, numOf(r.mcId, r.num)), '已分解', '分解失败')"
        >
          分解
        </button>
      </div>
    </div>
  </div>
</template>

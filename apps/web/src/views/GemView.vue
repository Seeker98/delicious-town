<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { GemItemDto, GemsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { ATTR_KEYS, ATTR_NAMES } from '../utils/labels';

const catalog = useCatalogStore();
const toast = useToastStore();
const g = ref<GemsDto | null>(null);
const nums = reactive<Record<number, number>>({});
const busy = ref(false);
const pct = (x: number) => `${(Math.max(0, x) * 100).toFixed(1)}%`;

async function load() {
  g.value = await endpoints.gems();
}
/** 最多能升几组：持有 / 2、体力 / 阶数、99 */
const maxOf = (x: GemItemDto) =>
  Math.min(Math.floor(x.num / 2), Math.floor((g.value?.strength ?? 0) / x.level), 99);
const numOf = (x: GemItemDto) => Math.max(1, Math.min(nums[x.goodsId] ?? 1, maxOf(x)));

async function levelUp(x: GemItemDto) {
  busy.value = true;
  try {
    const r = await endpoints.gemLevelUp(x.goodsId, numOf(x));
    const lucky = r.lucky > 0 ? `（含幸运补救 ${r.lucky}）` : '';
    const exp = r.exp > 0 ? `，得到经验 ${formatNum(r.exp)}` : '';
    toast.push(`升阶完成：成功 ${r.success}${lucky}，失败 ${r.fail}${exp}`);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '升阶失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取宝石失败'), 'danger')));
</script>

<template>
  <div v-if="g">
    <h5>宝石</h5>
    <p class="small text-muted">
      两颗同阶合成一颗下一阶，每组耗体力 = 阶数；失败时还有 {{ pct(g.luckRate) }} 的幸运补救，失败的每组得
      阶数×1000 经验。体力 {{ g.strength }}。
    </p>
    <div v-if="g.items.length === 0" class="text-muted small">还没有宝石</div>
    <div
      v-for="x in g.items"
      :key="x.goodsId"
      class="d-flex align-items-center gap-1 border-bottom py-1 small"
    >
      <div class="flex-fill">
        <b>{{ catalog.goodsName(x.goodsId) }}</b> ×{{ x.num }}
        <span class="text-muted">
          {{
            ATTR_KEYS.filter((k) => x.attrs[k] > 0)
              .map((k) => `${ATTR_NAMES[k]}+${x.attrs[k]}`)
              .join(' ')
          }}
        </span>
        <div class="text-muted">
          {{ x.nextId === null ? '已是最高阶' : `→ ${catalog.goodsName(x.nextId)}，成功率 ${pct(x.rate)}` }}
        </div>
      </div>
      <input
        v-model.number="nums[x.goodsId]"
        type="number"
        min="1"
        :max="Math.max(1, maxOf(x))"
        class="form-control form-control-sm"
        style="width: 60px"
        :data-testid="`levelup-num-${x.goodsId}`"
      />
      <button
        class="btn btn-sm btn-primary"
        :disabled="busy || x.nextId === null || maxOf(x) < 1"
        :data-testid="`levelup-${x.goodsId}`"
        @click="levelUp(x)"
      >
        升阶 ×{{ numOf(x) }}
      </button>
    </div>
  </div>
</template>

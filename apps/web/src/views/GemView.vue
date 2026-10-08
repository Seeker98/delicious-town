<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { GemItemDto, GemsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum, formatPct } from '../utils/format';
import { ATTR_KEYS, ATTR_NAMES } from '../utils/labels';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const g = ref<GemsDto | null>(null);
const nums = reactive<Record<number, number>>({});
const busy = ref(false);
const pct = (x: number) => formatPct(Math.max(0, x), { min: 1 });

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
    toast.push(t.value.equip.gemPage.done(r.success, r.lucky, r.fail, r.exp > 0 ? formatNum(r.exp) : null));
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.equip.gemPage.failed), 'danger');
  } finally {
    busy.value = false;
  }
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.equip.gemPage.loadFailed), 'danger')));
</script>

<template>
  <div v-if="g">
    <h5>{{ t.equip.gemPage.title }}</h5>
    <!-- 自己的体力单独一行（问题记录 532：原来接在规则说明末尾写“体力 N。”，看不懂） -->
    <p class="small text-muted mb-1" data-testid="gem-intro">
      {{ t.equip.gemPage.intro(pct(g.luckRate)) }}
    </p>
    <p class="small mb-2" data-testid="gem-strength">
      <i class="bi bi-lightning"></i> {{ t.equip.gemPage.myStrength(formatNum(g.strength)) }}
    </p>
    <div v-if="g.items.length === 0" class="text-muted small">{{ t.equip.gemPage.empty }}</div>
    <div
      v-for="x in g.items"
      :key="x.goodsId"
      class="d-flex align-items-center gap-1 border-bottom py-1 small"
    >
      <div class="flex-fill">
        <b>{{ catalog.goodsName(x.goodsId) }}</b
        >{{ t.common.times }}{{ x.num }}
        <span class="text-muted">
          {{
            ATTR_KEYS.filter((k) => x.attrs[k] > 0)
              .map((k) => `${ATTR_NAMES[k]}+${x.attrs[k]}`)
              .join(' ')
          }}
        </span>
        <div class="text-muted">
          {{
            x.nextId === null
              ? t.equip.gemPage.maxed
              : t.equip.gemPage.next(catalog.goodsName(x.nextId), pct(x.rate))
          }}
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
        {{ t.equip.gemPage.levelUp(numOf(x)) }}
      </button>
    </div>
  </div>
</template>

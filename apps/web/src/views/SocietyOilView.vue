<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { OilNeedDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import NeedChecks from '../components/NeedChecks.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { usePageTitle } from '../stores/pageTitle';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { needReason } from '../utils/needs';

/** 油壶扩容（界面改版 P10）：和升星同一种样子——对比卡、一行说明、条件清单、整宽按钮 */
const toast = useToastStore();
const catalog = useCatalogStore();
const t = useT();
const need = ref<OilNeedDto | null>(null);
const failed = ref(false);
usePageTitle(() => t.value.society.links.oil.label);
const busy = ref(false);

async function load() {
  try {
    need.value = await endpoints.oilNeed();
    failed.value = false;
  } catch (e) {
    failed.value = true;
    toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
}
async function expand() {
  busy.value = true;
  try {
    await endpoints.oilExpand();
    toast.push(t.value.society.oil.done);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.society.oil.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(load);
const missing = computed(() => need.value?.checks.filter((c) => !c.ok).length ?? 0);
</script>

<template>
  <template v-if="need">
    <div class="dt-card dt-up-hero" data-testid="oil-hero">
      <div class="dt-up-side">
        <DtArt name="res-oil" :size="44" />
        <b>{{ t.society.oil.level(need.oilLevel) }}</b>
        <span>{{ t.society.oil.max(formatNum(need.oilMax)) }}</span>
      </div>
      <template v-if="need.nextLevel">
        <span class="dt-up-arrow" aria-hidden="true">→</span>
        <div class="dt-up-side">
          <DtArt name="res-oil" :size="52" />
          <b>{{ t.society.oil.level(need.nextLevel) }}</b>
          <span>{{ t.society.oil.max(formatNum(need.nextOilMax ?? 0)) }}</span>
        </div>
      </template>
    </div>
    <p class="dt-block-note mt-2">{{ t.society.oil.why }}</p>
    <template v-if="need.nextLevel">
      <div class="dt-block-head mt-3">
        <h2 class="dt-block-title">{{ t.society.oil.checksTitle }}</h2>
        <span class="dt-block-more">{{
          missing > 0 ? t.society.up.missing(missing) : t.society.up.allOk
        }}</span>
      </div>
      <NeedChecks :checks="need.checks" />
      <button
        type="button"
        class="btn btn-primary dt-btn-block mt-4"
        data-testid="oil-up"
        :disabled="busy || !need.ok"
        @click="expand"
      >
        {{ t.society.oil.btnTo(need.nextLevel) }}
      </button>
      <p v-if="!need.ok" class="dt-up-reason" data-testid="oil-reason">
        {{ needReason(need.checks, t, (id) => catalog.goodsName(id)) }}
      </p>
    </template>
    <div v-else class="dt-card dt-up-max mt-3" data-testid="oil-max">{{ t.society.oil.maxed }}</div>
  </template>
  <DtEmpty v-else-if="failed" :title="t.common.loadFailed"
    ><button type="button" class="btn btn-sm btn-outline-primary" @click="load">
      {{ t.town.retry }}
    </button></DtEmpty
  >
  <DtSkeleton v-else :rows="4" />
</template>

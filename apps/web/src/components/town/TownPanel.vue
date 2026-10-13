<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { TownDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import DtArt from '../DtArt.vue';

/**
 * 广场 · 居民（界面改版 P10）：蟹老板的钱袋（大头像卡 + 摇一摇）、改天气（天气改版：雷神锤换成司天罗盘、晴雨签，
 * 在天气页用；这里一行入口）。星愿和神灯已删掉（道具减法，用户 2026-10-13）
 */
defineProps<{ data: TownDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);

async function act<T>(fn: () => Promise<T>, done: (r: T) => string, fallback: string): Promise<boolean> {
  if (busy.value) return false;
  busy.value = true;
  try {
    toast.push(done(await fn()), 'success');
    emit('reload');
    return true;
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    // 失败多半是页面已经过时（跨天等）：重新读一次
    emit('reload');
    return false;
  } finally {
    busy.value = false;
  }
}
function shake() {
  void act(
    () => endpoints.townShake(),
    (r) =>
      t.value.town.shook(formatNum(r.coin)) +
      (r.egg ? t.value.town.shookEgg(catalog.goodsName(r.egg.goodsId), r.egg.num) : ''),
    t.value.town.shakeFailed,
  );
}
</script>

<template>
  <!-- 广场没有别的 NPC 了：雯姐在酒吧（问题记录 453）；13 哥、镇长大胃锅、卡门的见面礼在协会（问题记录 441） -->
  <div class="dt-card dt-mascot is-large dt-krab" data-testid="krab-card">
    <span class="dt-npc-ava"><DtArt name="npc-krab" :size="56" /></span>
    <div class="dt-mascot-text">
      <b>{{ t.town.krab }}</b>
      <span class="dt-krab-hint">{{ t.town.shakeHint }}</span>
    </div>
    <span v-if="data.shaken" class="dt-tag dt-tag-ok text-nowrap" data-testid="shake">{{
      t.town.shakenToday
    }}</span>
    <button
      v-else
      type="button"
      class="btn btn-sm btn-primary text-nowrap"
      :disabled="busy"
      data-testid="shake"
      @click="shake"
    >
      {{ t.town.shake }}
    </button>
  </div>

  <div class="dt-block-head mt-3">
    <h2 class="dt-block-title">{{ t.town.weatherTool }}</h2>
  </div>
  <div class="dt-card dt-rows-card">
    <RouterLink to="/weather" class="dt-row is-link" data-testid="weather-tool-row">
      <span class="dt-row-ico"><DtArt name="goods-compass" :size="28" /></span>
      <span class="dt-row-main">
        <span class="dt-row-title is-strong">{{ t.town.toWeather }}</span>
        <span class="dt-row-sub dt-row-sub-wrap">{{
          t.town.weatherToolSub(catalog.weatherName(data.weather.id, data.weather.name))
        }}</span>
      </span>
    </RouterLink>
  </div>
</template>

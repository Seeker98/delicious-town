<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { useRestaurantStore } from '../stores/restaurant';
import DtArt from './DtArt.vue';
import DtSheet from './DtSheet.vue';

/**
 * 第一次够星时弹一次的时令说明（天气改版 PR②，指引②；设计图 Sl-E）：三步说明，“知道了”或“去天气页看看”。
 * 看过记在服务端（换设备不再弹）；记失败也先关掉，下次进游戏再弹
 */
const t = useT();
const router = useRouter();
const restStore = useRestaurantStore();
const open = computed(() => !!restStore.rest?.shilingIntro);
const intro = computed(() => t.value.misc.weather.shiling.intro);

async function close(go: boolean) {
  if (restStore.rest) restStore.rest = { ...restStore.rest, shilingIntro: false };
  if (go) void router.push('/weather');
  try {
    await endpoints.shilingIntro();
  } catch {
    // 忽略：下次进游戏再弹
  }
}
</script>

<template>
  <DtSheet center :open="open" :title="intro.title" @close="close(false)">
    <template #art><DtArt name="res-shiling" :size="44" /></template>
    <p class="dt-sl-intro-sub">{{ intro.sub }}</p>
    <ol class="dt-sl-intro-steps" data-testid="shiling-intro">
      <li v-for="(x, i) in intro.steps" :key="i">
        <span class="dt-sl-intro-n">{{ i + 1 }}</span>
        <span
          ><b>{{ x[0] }}</b
          >{{ x[1] }}</span
        >
      </li>
    </ol>
    <template #actions>
      <button
        type="button"
        class="btn btn-outline-secondary"
        data-testid="shiling-intro-ok"
        @click="close(false)"
      >
        {{ intro.ok }}
      </button>
      <button type="button" class="btn btn-primary" data-testid="shiling-intro-go" @click="close(true)">
        {{ intro.go }}
      </button>
    </template>
  </DtSheet>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { OpenGuideNumbers } from '@dt/shared';
import { useT } from '../../composables/useT';
import { useWikiData } from './wiki';

/** 玩法攻略（问题记录 384）：快速模拟里勤快、普通、休闲三种机器人的做法，写给玩家看 */
const t = useT();
const data = useWikiData();

/**
 * 攻略里的数（菜数、外卖门槛、交易所门槛、新手经验加成）按开放接口给的默认配置写（backlog 384）。
 * 还没读到、或接口是发版前缓存的旧响应（没有这些数）时，带数的几条先不显示
 */
const nums = ref<OpenGuideNumbers | null>(null);
onMounted(async () => {
  try {
    nums.value = (await data.index()).guide ?? null;
  } catch {
    nums.value = null;
  }
});
type Item = string | ((n: OpenGuideNumbers) => string);
const shown = (items: readonly Item[]) =>
  items.flatMap((x) => (typeof x === 'string' ? [x] : nums.value ? [x(nums.value)] : []));
</script>

<template>
  <div>
    <RouterLink to="/wiki" class="small">{{ t.wiki.home }}</RouterLink>
    <h5 class="dt-page-title mt-2">{{ t.wiki.guide.title }}</h5>
    <p class="small">{{ t.wiki.guide.intro }}</p>
    <section v-for="s in t.wiki.guide.sections" :key="s.title" class="mb-3" data-testid="guide-section">
      <h6 class="dt-section">{{ s.title }}</h6>
      <ul class="small ps-3 mb-0">
        <li v-for="item in shown(s.items)" :key="item" class="mb-1">{{ item }}</li>
      </ul>
    </section>
  </div>
</template>

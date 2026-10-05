<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useT } from '../../composables/useT';

/** 玩法攻略（问题记录 384）：快速模拟里勤快、普通、休闲三种机器人的做法，写给玩家看 */
const t = useT();
</script>

<template>
  <div>
    <RouterLink to="/wiki" class="small">{{ t.wiki.home }}</RouterLink>
    <h5 class="dt-page-title mt-2">{{ t.wiki.guide.title }}</h5>
    <p class="small">{{ t.wiki.guide.intro }}</p>
    <section v-for="s in t.wiki.guide.sections" :key="s.title" class="mb-3" data-testid="guide-section">
      <h6 class="dt-section">{{ s.title }}</h6>
      <ul class="small ps-3 mb-0">
        <li v-for="item in s.items" :key="item" class="mb-1">{{ item }}</li>
      </ul>
    </section>
  </div>
</template>

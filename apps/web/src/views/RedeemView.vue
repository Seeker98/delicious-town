<script setup lang="ts">
import RedeemBox from '../components/RedeemBox.vue';
import { useT } from '../composables/useT';

/** 兑换码独立入口（问题记录 164）：邮箱页的兑换框保留 */
const t = useT();
</script>

<template>
  <div class="dt-page-title">
    <h5>{{ t.misc.redeem.title }}</h5>
  </div>
  <RedeemBox />
  <p class="small text-muted">{{ t.misc.redeem.note }}</p>
</template>

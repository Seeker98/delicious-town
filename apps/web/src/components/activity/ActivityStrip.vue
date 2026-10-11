<script setup lang="ts">
import type { ActivityDto } from '@dt/shared';
import { useT } from '../../composables/useT';

/** 活动条（问题记录 226）：每个活动一个筛选胶囊（界面改版 P7：和别处的筛选一样），点哪个下面就显示哪个的详情；类型和剩余时间写在详情卡片头上 */
defineProps<{ items: ActivityDto[]; selected: number | null }>();
defineEmits<{ select: [id: number] }>();
const t = useT();
</script>

<template>
  <div class="dt-pills dt-pills-scroll" role="tablist">
    <button
      v-for="a in items"
      :key="a.id"
      type="button"
      role="tab"
      :aria-selected="a.id === selected"
      :class="{ active: a.id === selected }"
      :data-testid="`act-tab-${a.id}`"
      @click="$emit('select', a.id)"
    >
      <span class="dt-act-tab-title">{{ a.title }}</span
      ><span v-if="a.claimable > 0" class="dt-tag dt-tag-danger ms-1">{{
        t.activity.claimable(a.claimable)
      }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ActivityDto } from '@dt/shared';
import { activityStatus, kindLabel } from '../../utils/activity';

/** 活动条（问题记录 226）：每个活动一个紧凑按钮，点哪个下面就显示哪个的详情 */
defineProps<{ items: ActivityDto[]; selected: number | null }>();
defineEmits<{ select: [id: number] }>();
</script>

<template>
  <div class="dt-act-strip mb-2" role="tablist">
    <button
      v-for="a in items"
      :key="a.id"
      type="button"
      role="tab"
      :aria-selected="a.id === selected"
      :class="[
        'btn btn-sm text-start dt-act-tab',
        a.id === selected ? 'btn-primary' : 'btn-outline-secondary',
      ]"
      :data-testid="`act-tab-${a.id}`"
      @click="$emit('select', a.id)"
    >
      <span class="d-flex align-items-center gap-1">
        <span class="badge text-bg-light">{{ kindLabel(a) }}</span>
        <span class="dt-act-tab-title">{{ a.title }}</span>
        <span v-if="a.claimable > 0" class="badge rounded-pill text-bg-danger">可领 {{ a.claimable }}</span>
      </span>
      <span class="d-block small opacity-75">{{ activityStatus(a) }}</span>
    </button>
  </div>
</template>

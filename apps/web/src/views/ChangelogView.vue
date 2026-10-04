<script setup lang="ts">
import { computed } from 'vue';
import { CHANGELOG, type ChangelogId } from '../data/changelog';
import { useT } from '../composables/useT';
import { activeLocale } from '../i18n';

/** 更新记录（问题记录 348）：按日期分组，从新到旧 */
const t = useT();
const days = computed(() => {
  const out: Array<{ date: string; ids: ChangelogId[] }> = [];
  for (const x of CHANGELOG) {
    const last = out[out.length - 1];
    if (last && last.date === x.date) last.ids.push(x.id);
    else out.push({ date: x.date, ids: [x.id] });
  }
  return out;
});
const dayText = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(activeLocale(), {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
</script>

<template>
  <div class="dt-page-title">
    <h5>{{ t.site.changelogTitle }}</h5>
  </div>
  <section v-for="d in days" :key="d.date" class="dt-card my-2 small" :data-testid="`cl-day-${d.date}`">
    <div class="dt-card-title mb-1">{{ dayText(d.date) }}</div>
    <ul class="mb-0 ps-3">
      <li v-for="id in d.ids" :key="id" data-testid="cl-item">{{ t.site.changelog[id] }}</li>
    </ul>
  </section>
</template>

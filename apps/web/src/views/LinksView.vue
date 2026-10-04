<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { LinkDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

/** 友情链接（问题记录 348）：后台维护；外部网站在新窗口打开，不带来源 */
const t = useT();
const toast = useToastStore();
const links = ref<LinkDto[] | null>(null);

onMounted(async () => {
  try {
    links.value = await endpoints.links();
  } catch (e) {
    toast.push(errorMessage(e, t.value.site.linksLoadFailed), 'danger');
  }
});
</script>

<template>
  <div class="dt-page-title">
    <h5>{{ t.site.linksTitle }}</h5>
  </div>
  <template v-if="links">
    <p v-if="links.length === 0" class="small text-muted" data-testid="links-empty">
      {{ t.site.linksEmpty }}
    </p>
    <div v-for="l in links" :key="l.id" class="dt-item">
      <div class="dt-item-main">
        <a
          :href="l.url"
          target="_blank"
          rel="noopener noreferrer nofollow"
          class="dt-item-title d-block"
          :data-testid="`link-${l.id}`"
          ><i class="bi bi-box-arrow-up-right me-1"></i>{{ l.name }}</a
        >
        <div v-if="l.note" class="small text-muted">{{ l.note }}</div>
      </div>
    </div>
  </template>
</template>

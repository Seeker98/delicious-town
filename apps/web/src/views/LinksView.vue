<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { LinkDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

/**
 * 友情链接（问题记录 348；界面改版 P11）：后台维护；一个站一行——名字、备注，右边外链小图标，
 * 点整行在新窗口打开，不带来源；没有链接时是空状态
 */
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
  <template v-if="links">
    <DtEmpty
      v-if="links.length === 0"
      art="wiki-link"
      :title="t.site.linksEmpty"
      :body="t.site.linksEmptyBody"
      data-testid="links-empty"
    />
    <div v-else class="dt-card dt-rows-card">
      <a
        v-for="l in links"
        :key="l.id"
        :href="l.url"
        target="_blank"
        rel="noopener noreferrer nofollow"
        class="dt-row dt-link-row"
        :data-testid="'link-' + l.id"
      >
        <span class="dt-code-art is-sm"><DtArt name="wiki-link" :size="26" /></span>
        <span class="dt-row-main">
          <span class="dt-row-title is-strong">{{ l.name }}</span>
          <span v-if="l.note" class="dt-row-sub dt-row-sub-wrap">{{ l.note }}</span>
        </span>
        <span class="dt-link-ext"><DtArt name="set-link" :size="16" /></span>
      </a>
    </div>
  </template>
</template>

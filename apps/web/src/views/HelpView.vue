<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import DtArt from '../components/DtArt.vue';
import { useChangelog } from '../composables/useChangelog';
import { useT } from '../composables/useT';
import { CHANGELOG } from '../data/changelog';
import { headBody } from '../utils/headBody';
import { isNewChangelog, readChangelogSeen } from '../utils/changelogSeen';
import { formatNum } from '../utils/format';
import { useWikiData } from './wiki/wiki';

/**
 * 帮助中心（界面改版设计 §4.1；P11 重排）：游玩指引放最上面一张浅紫大卡（新玩家先点它）；
 * 资料库、玩法攻略、更新记录、开放接口做成 2×2 图块，每块一句话写里面有什么；
 * 更新记录写最新一天的第一条标题，有没看过的更新时带红色“新”；友情链接放最下面一行
 */
const t = useT();
const wiki = useWikiData();
const total = ref<number | null>(null);
onMounted(async () => {
  try {
    const idx = await wiki.index();
    total.value = Object.values(idx.counts).reduce((a, b) => a + b, 0);
  } catch {
    total.value = null;
  }
});

/** 更新记录文案分包按需加载：到了才写最新一条的标题 */
const changelog = useChangelog();
const latest = CHANGELOG[0];
const hasNew = isNewChangelog(latest?.date ?? '', readChangelogSeen());
const latestText = computed(() => {
  if (!latest || !changelog.value) return '';
  const [, m, d] = latest.date.split('-').map(Number) as [number, number, number];
  const day = t.value.site.monthDay(m, d);
  const { head, body } = headBody(changelog.value[latest.id]);
  return t.value.nav.help.changelogSub(day, head || body);
});
</script>

<template>
  <RouterLink to="/guide" class="dt-help-hero" data-testid="help-guide">
    <span class="dt-help-hero-art"><DtArt name="wiki-guide" :size="48" /></span>
    <span class="dt-row-main">
      <b class="dt-help-hero-title">{{ t.nav.help.guide }}</b>
      <span class="dt-help-hero-sub">{{ t.nav.help.guideSub }}</span>
    </span>
  </RouterLink>
  <div class="dt-help-grid">
    <RouterLink to="/wiki" class="dt-help-tile" data-testid="help-wiki">
      <span class="dt-help-tile-art"><DtArt name="wiki-books" :size="30" /></span>
      <b>{{ t.nav.help.wiki }}</b>
      <span>{{ total ? t.nav.help.wikiSubCount(formatNum(total)) : t.nav.help.wikiSub }}</span>
    </RouterLink>
    <RouterLink to="/wiki/guide" class="dt-help-tile" data-testid="help-wiki-guide">
      <span class="dt-help-tile-art"><DtArt name="wiki-compass" :size="30" /></span>
      <b>{{ t.nav.help.wikiGuide }}</b>
      <span>{{ t.nav.help.wikiGuideSub }}</span>
    </RouterLink>
    <RouterLink to="/changelog" class="dt-help-tile" data-testid="help-changelog">
      <span class="dt-help-tile-art"><DtArt name="wiki-news" :size="30" /></span>
      <b
        >{{ t.nav.help.changelog
        }}<span v-if="hasNew" class="dt-tag dt-tag-danger" data-testid="help-changelog-new">{{
          t.site.newMark
        }}</span></b
      >
      <span class="dt-clamp2">{{ latestText }}</span>
    </RouterLink>
    <RouterLink to="/wiki/api" class="dt-help-tile" data-testid="help-api">
      <span class="dt-help-tile-art"><DtArt name="wiki-api" :size="30" /></span>
      <b>{{ t.nav.help.api }}</b>
      <span>{{ t.nav.help.apiSub }}</span>
    </RouterLink>
  </div>
  <div class="dt-card dt-rows-card mt-2">
    <RouterLink to="/links" class="dt-row is-link" data-testid="help-links">
      <span class="dt-code-art is-sm"><DtArt name="wiki-link" :size="26" /></span>
      <span class="dt-row-main"
        ><span class="dt-row-title">{{ t.nav.help.links }}</span></span
      >
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import NavRow from '../components/NavRow.vue';
import { useT } from '../composables/useT';

/** 帮助中心（界面改版设计 §4.1）：指引、资料库、攻略、开放接口、更新记录、友情链接 */
const t = useT();
</script>

<template>
  <div class="dt-group-card">
    <NavRow to="/guide" art="sec-tasks" :label="t.nav.help.guide" />
    <NavRow to="/wiki" art="nav-cookbooks" :label="t.nav.help.wiki" />
    <NavRow to="/wiki/guide" art="sec-star" :label="t.nav.help.wikiGuide" />
    <NavRow to="/wiki/api" art="me-settings" :label="t.nav.help.api" />
    <NavRow to="/changelog" art="sec-news" :label="t.nav.help.changelog" />
    <NavRow to="/links" art="place-forum" :label="t.nav.help.links" />
  </div>
</template>

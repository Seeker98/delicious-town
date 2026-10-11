<script setup lang="ts">
import { computed } from 'vue';
import NavRow from '../components/NavRow.vue';
import { useT } from '../composables/useT';
import { useRestaurantStore } from '../stores/restaurant';
import { useSessionStore } from '../stores/session';

/** 我（界面改版设计 §4.1）：店铺头 + 我的店、账号、帮助；协管和管理员多一个后台 */
const t = useT();
const restStore = useRestaurantStore();
const session = useSessionStore();
const rest = computed(() => restStore.rest);
const staff = computed(() => Boolean(session.me && session.me.role !== 'player'));
/** 区服关掉的功能不显示（问题记录 248） */
const on = (f: string) => restStore.featureOn(f);
</script>

<template>
  <div v-if="rest" class="dt-me-head">
    <span class="dt-me-avatar">{{ [...rest.name][0] }}</span>
    <div class="dt-min0">
      <div class="dt-card-title dt-clamp1">{{ rest.name }}</div>
      <div class="dt-meta">{{ t.nav.me.headLine(session.me?.username ?? '', rest.streetName) }}</div>
    </div>
  </div>
  <h2 class="dt-section">{{ t.nav.me.groups.shop }}</h2>
  <div class="dt-group-card">
    <NavRow to="/rest/info" art="me-info" :label="t.nav.me.info" />
    <NavRow to="/rest/look" art="me-look" :label="t.nav.me.look" />
    <NavRow v-if="on('equip')" to="/rest/equip" art="me-equip" :label="t.nav.me.equip" />
    <NavRow v-if="on('store')" to="/store" art="me-store" :label="t.nav.me.store" />
  </div>
  <h2 class="dt-section">{{ t.nav.me.groups.account }}</h2>
  <div class="dt-group-card">
    <NavRow v-if="on('redeem')" to="/redeem" art="me-redeem" :label="t.nav.me.redeem" />
    <NavRow to="/account" art="me-settings" :label="t.nav.me.settings" />
    <NavRow to="/shards" art="me-shard" :label="t.nav.me.shard" />
  </div>
  <h2 class="dt-section">{{ t.nav.me.groups.help }}</h2>
  <div class="dt-group-card">
    <NavRow to="/help" art="me-help" :label="t.nav.me.help" />
    <NavRow v-if="staff" to="/admin" art="me-admin" :label="t.nav.me.admin" />
  </div>
</template>

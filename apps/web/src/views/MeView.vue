<script setup lang="ts">
import { computed, onMounted } from 'vue';
import DtAvatar from '../components/DtAvatar.vue';
import NavRow from '../components/NavRow.vue';
import { useT } from '../composables/useT';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useSessionStore } from '../stores/session';
import { useShardsStore } from '../stores/shards';
import { restAva } from '../utils/restAva';

/**
 * 我（界面改版设计 §4.1；P11 换店铺头）：店铺头是选好的头像 + 店名 + 等级角标，下面一行写用户名、区服、街道、星级；
 * 下面分组：我的店、账号、帮助，分组标题是卡片外的小灰字；协管和管理员多一个后台
 */
const t = useT();
const restStore = useRestaurantStore();
const session = useSessionStore();
const catalog = useCatalogStore();
const shards = useShardsStore();
const rest = computed(() => restStore.rest);
const shardName = computed(() => shards.nameOf(session.me?.shardId));
const staff = computed(() => Boolean(session.me && session.me.role !== 'player'));
/** 区服关掉的功能不显示（问题记录 248） */
const on = (f: string) => restStore.featureOn(f);
onMounted(() => {
  void shards.load();
  void catalog.load().catch(() => undefined);
});
</script>

<template>
  <section v-if="rest" class="dt-card dt-me-head" data-testid="me-head">
    <span class="dt-me-ava"
      ><DtAvatar :art="restAva(rest.id, rest.avatar, catalog.avatarArt)" :frame="rest.frame" :size="64"
    /></span>
    <div class="dt-min0">
      <div class="dt-me-name">
        <span class="dt-clamp1">{{ rest.name }}</span
        ><span class="dt-tag dt-lv is-t3">{{ t.wiki.level(rest.level) }}</span>
      </div>
      <div class="dt-meta">
        {{ t.nav.me.headLine(session.me?.username ?? '', shardName, rest.streetName, rest.starLevel) }}
      </div>
    </div>
  </section>
  <h2 class="dt-group-title">{{ t.nav.me.groups.shop }}</h2>
  <div class="dt-group-card dt-me-group">
    <NavRow to="/rest/info" art="me-info" :label="t.nav.me.info" />
    <NavRow to="/rest/look" art="me-look" :label="t.nav.me.look" />
    <NavRow to="/achievements" art="fac-trophy" :label="t.nav.me.achieve" />
    <NavRow v-if="on('equip')" to="/rest/equip" art="me-equip" :label="t.nav.me.equip" />
    <NavRow v-if="on('store')" to="/store" art="me-store" :label="t.nav.me.store" />
  </div>
  <h2 class="dt-group-title">{{ t.nav.me.groups.account }}</h2>
  <div class="dt-group-card dt-me-group">
    <NavRow v-if="on('redeem')" to="/redeem" art="me-redeem" :label="t.nav.me.redeem" />
    <NavRow to="/account" art="me-settings" :label="t.nav.me.settings" />
    <NavRow to="/shards" art="me-shard" :label="t.nav.me.shard" :value="shardName" />
  </div>
  <h2 class="dt-group-title">{{ t.nav.me.groups.help }}</h2>
  <div class="dt-group-card dt-me-group">
    <NavRow to="/help" art="me-help" :label="t.nav.me.help" />
    <NavRow v-if="staff" to="/admin" art="me-admin" :label="t.nav.me.admin" />
  </div>
</template>

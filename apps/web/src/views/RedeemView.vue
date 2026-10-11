<script setup lang="ts">
import { ref } from 'vue';
import NavRow from '../components/NavRow.vue';
import NewbieCodes from '../components/NewbieCodes.vue';
import RedeemBox from '../components/RedeemBox.vue';
import { useT } from '../composables/useT';
import { useRestaurantStore } from '../stores/restaurant';

/**
 * 兑换码（问题记录 164）：兑换码只留这一处（界面改版 P2b）——兑换框、新手兑换码（原来在游玩指引）、
 * 邀请好友（原来在账号页）；邮箱和指引只放一条链接过来
 */
const t = useT();
const restStore = useRestaurantStore();
const codes = ref<InstanceType<typeof NewbieCodes> | null>(null);
</script>

<template>
  <RedeemBox @redeemed="codes?.reload()" />
  <p class="small text-muted">{{ t.misc.redeem.note }}</p>
  <NewbieCodes ref="codes" class="mb-3" />
  <NavRow v-if="restStore.featureOn('invite')" to="/invite" art="nav-friends" :label="t.misc.invite.title" />
</template>

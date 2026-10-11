<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { InviteDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtArt from '../components/DtArt.vue';
import NewbieCodes from '../components/NewbieCodes.vue';
import RedeemBox from '../components/RedeemBox.vue';
import { useT } from '../composables/useT';
import { useRestaurantStore } from '../stores/restaurant';

/**
 * 兑换码和邀请（界面改版 P2b；P11 重排）：兑换框一张卡，下面新手兑换码一行一个，
 * 最下面一张“邀请好友”入口卡，写本月已邀请几人
 */
const t = useT();
const restStore = useRestaurantStore();
const codes = ref<InstanceType<typeof NewbieCodes> | null>(null);
const invite = ref<InviteDto | null>(null);
onMounted(async () => {
  if (!restStore.featureOn('invite')) return;
  invite.value = await endpoints.invite().catch(() => null);
});
</script>

<template>
  <RedeemBox @redeemed="codes?.reload()" />
  <NewbieCodes ref="codes" class="mt-3" />
  <div v-if="restStore.featureOn('invite')" class="dt-card dt-rows-card mt-3">
    <RouterLink to="/invite" class="dt-row is-link dt-invite-entry" data-testid="invite-entry">
      <span class="dt-code-art"><DtArt name="town-invite" :size="30" /></span>
      <span class="dt-row-main">
        <span class="dt-row-title is-strong">{{ t.misc.invite.title }}</span>
        <span class="dt-row-sub">{{
          invite ? t.misc.invite.entrySub(invite.monthCount, invite.monthlyCap) : t.misc.invite.entrySubPlain
        }}</span>
      </span>
    </RouterLink>
  </div>
</template>

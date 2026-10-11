<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { endpoints } from '../api/endpoints';
import AuthField from '../components/auth/AuthField.vue';
import AuthScene from '../components/auth/AuthScene.vue';
import DtArt from '../components/DtArt.vue';
import TurnstileBox from '../components/TurnstileBox.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';

/** 找回密码（界面改版 P11）：矮版头图 + 表单卡；发出以后同一张卡换成结果（邮件图标 + 说明 + 返回登录） */
const email = ref('');
const captchaToken = ref('');
const turnstile = ref<InstanceType<typeof TurnstileBox> | null>(null);
const sent = ref(false);
const error = ref('');
const busy = ref(false);
const t = useT();

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await endpoints.forgotPassword({ email: email.value.trim(), captchaToken: captchaToken.value });
    sent.value = true;
  } catch (e) {
    error.value = errorMessage(e, t.value.auth.sendFailed);
    // 人机验证令牌只能用一次，失败后作废并重新出题
    captchaToken.value = '';
    turnstile.value?.reset();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthScene short />
  <section class="dt-auth-card">
    <div v-if="sent" class="dt-auth-result" data-testid="forgot-sent">
      <span class="dt-auth-ring is-ok"><DtArt name="set-mail" :size="30" /></span>
      <b>{{ t.auth.forgotSentTitle }}</b>
      <span>{{ t.auth.forgotSent }}</span>
      <RouterLink to="/login" class="btn btn-light dt-btn-block dt-auth-submit">{{
        t.auth.backToLogin
      }}</RouterLink>
    </div>
    <template v-else>
      <div v-if="error" class="dt-auth-error" role="alert">{{ error }}</div>
      <h2 class="dt-auth-title">{{ t.auth.forgotTitle }}</h2>
      <p class="dt-auth-sub">{{ t.auth.forgotSub }}</p>
      <form @submit.prevent="submit">
        <AuthField v-model="email" :label="t.auth.email" type="email" autocomplete="email" required />
        <TurnstileBox ref="turnstile" class="mt-3" @token="captchaToken = $event" />
        <button class="btn btn-primary dt-btn-block dt-auth-submit" :disabled="busy || !captchaToken">
          {{ t.auth.sendReset }}
        </button>
      </form>
      <p class="dt-auth-links is-center">
        <RouterLink to="/login" class="dt-go">{{ t.auth.backToLogin }}</RouterLink>
      </p>
    </template>
  </section>
</template>

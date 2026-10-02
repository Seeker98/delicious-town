<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { endpoints } from '../api/endpoints';
import TurnstileBox from '../components/TurnstileBox.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';

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
    await endpoints.forgotPassword({ email: email.value, captchaToken: captchaToken.value });
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
  <div class="card">
    <div class="card-body">
      <h5 class="card-title">{{ t.auth.forgotTitle }}</h5>
      <p v-if="sent" class="text-success">{{ t.auth.forgotSent }}</p>
      <form v-else @submit.prevent="submit">
        <input
          v-model.trim="email"
          type="email"
          class="form-control mb-2"
          :placeholder="t.auth.forgotEmail"
          required
        />
        <TurnstileBox ref="turnstile" @token="captchaToken = $event" />
        <div v-if="error" class="alert alert-danger py-1 my-2">{{ error }}</div>
        <button class="btn btn-primary w-100" :disabled="busy || !captchaToken">
          {{ t.auth.sendReset }}
        </button>
      </form>
      <div class="mt-2 small">
        <RouterLink to="/login">{{ t.auth.backToLogin }}</RouterLink>
      </div>
    </div>
  </div>
</template>

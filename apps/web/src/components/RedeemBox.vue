<script setup lang="ts">
import { ref } from 'vue';
import type { RewardItems } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import RewardChips from './RewardChips.vue';

/**
 * 兑换码输入框（子项目 6A-2；界面改版 P11）：输入框和“兑换”放一张卡，下面一行灰字说明；
 * 兑换成功在卡下面出一块绿底“领到了”带奖励胶囊，失败写红字，不用弹出提示
 */
const emit = defineEmits<{ redeemed: [] }>();
const code = ref('');
const t = useT();
const busy = ref(false);
const result = ref<{ ok: true; items: RewardItems } | { ok: false; text: string } | null>(null);

async function go() {
  const c = code.value.trim();
  if (!c || busy.value) return;
  busy.value = true;
  try {
    const r = await endpoints.redeem(c);
    result.value = { ok: true, items: r.items };
    code.value = '';
    emit('redeemed');
  } catch (e) {
    result.value = { ok: false, text: errorMessage(e, t.value.mail.redeem.failed) };
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="dt-card dt-redeem-box">
    <label class="dt-field-label-top" for="dt-redeem-code">{{ t.mail.redeem.label }}</label>
    <div class="dt-redeem-row">
      <div class="dt-field">
        <input
          id="dt-redeem-code"
          v-model="code"
          class="dt-field-input dt-mono"
          :placeholder="t.mail.redeem.placeholder"
          maxlength="40"
          autocomplete="off"
          data-testid="redeem-input"
          @keydown.enter.prevent="go"
        />
      </div>
      <button
        type="button"
        class="btn btn-primary dt-redeem-go"
        :disabled="busy || !code.trim()"
        data-testid="redeem-go"
        @click="go"
      >
        {{ t.mail.redeem.btn }}
      </button>
    </div>
    <p class="dt-field-hint">{{ t.misc.redeem.note }}</p>
    <div v-if="result?.ok" class="dt-redeem-done" role="status" data-testid="redeem-result">
      <b>{{ t.mail.redeem.got }}</b>
      <RewardChips :items="result.items" />
    </div>
    <div v-else-if="result" class="dt-field-hint is-bad" role="status" data-testid="redeem-result">
      {{ result.text }}
    </div>
  </section>
</template>

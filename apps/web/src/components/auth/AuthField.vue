<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { useT } from '../../composables/useT';

/**
 * 表单里的一格（界面改版 P11：登录注册、找回密码、改密码、开店）：上面标签，下面输入框；
 * 哪一格不对就在这一格下面写红字、框变红（error），没错时写灰字说明（hint）；
 * 密码框右边有眼睛按钮，可以显示密码。说明那一行右边可以写字数（count）
 */
const props = defineProps<{
  label: string;
  /** 标签后面的灰字，比如“(可不填)” */
  optional?: string;
  type?: 'text' | 'password' | 'email';
  placeholder?: string;
  autocomplete?: string;
  hint?: string;
  error?: string;
  /** 说明那一行右边的字数（开店页的名字） */
  count?: string;
  maxlength?: number;
  required?: boolean;
  testid?: string;
}>();
const model = defineModel<string>({ required: true });
const t = useT();
const id = `dt-f-${useId()}`;
const show = ref(false);
const inputType = computed(() => (props.type === 'password' && show.value ? 'text' : (props.type ?? 'text')));
const note = computed(() => props.error || props.hint || '');
</script>

<template>
  <div class="dt-auth-field">
    <label :for="id" class="dt-field-label-top"
      >{{ label }}<span v-if="optional" class="dt-auth-optional"> {{ optional }}</span></label
    >
    <div :class="['dt-field', { 'is-bad': !!error }]">
      <input
        :id="id"
        v-model="model"
        class="dt-field-input"
        :type="inputType"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :maxlength="maxlength"
        :required="required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="note || count ? `${id}-note` : undefined"
        :data-testid="testid"
      />
      <button
        v-if="type === 'password'"
        type="button"
        class="dt-field-eye"
        :aria-label="t.auth.showPw"
        :aria-pressed="show"
        @click="show = !show"
      >
        <i :class="['bi', show ? 'bi-eye-slash' : 'bi-eye']" aria-hidden="true"></i>
      </button>
    </div>
    <div v-if="note || count" :id="`${id}-note`" :class="['dt-field-hint', { 'is-bad': !!error }]">
      <span>{{ note }}</span
      ><span v-if="count" class="dt-field-count" data-testid="field-count">{{ count }}</span>
    </div>
  </div>
</template>

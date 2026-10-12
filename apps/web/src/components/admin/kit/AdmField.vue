<script setup lang="ts">
/** 表单分组卡里的一行（界面改版 P12）：左边字段名和限制（hint），右边输入；输入下面可写一行灰字（help） */
defineProps<{ label?: string; hint?: string; help?: string; for?: string }>();
</script>

<template>
  <div class="dt-adm-frow">
    <label :for="$props.for"
      >{{ label }}<small v-if="hint">{{ hint }}</small></label
    >
    <div>
      <slot />
      <div v-if="help || $slots.help" class="dt-adm-help">
        <slot name="help">{{ help }}</slot>
      </div>
    </div>
  </div>
</template>

import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it } from 'vitest';
import { computed } from 'vue';
import { useLocaleStore } from '../stores/locale';
import { remainText } from '../utils/remain';
import { CUSTOMER_NAMES } from '../utils/labels';
import { activeLocale, activeMessages } from '.';

/** 加载英文翻译包可能较慢（全量并行跑时） */
const LOAD = 15_000;

describe('activeMessages 跟着语言 store 走（问题记录 314）', () => {
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it(
    '用 activeMessages 算出来的 computed，切换语言后不用重新挂载也会变（以前要刷新页面）',
    async () => {
      setActivePinia(createPinia());
      const s = useLocaleStore();
      const forever = computed(() => remainText(null));
      const customer = computed(() => CUSTOMER_NAMES['1']);
      const zh = [forever.value, customer.value];
      expect(zh[0]).toBe('永久');
      await s.set('en');
      expect(forever.value).toBe('Permanent');
      expect(customer.value).not.toBe(zh[1]);
      expect(activeLocale()).toBe('en');
      expect(activeMessages()).toBe(s.messages);
    },
    LOAD,
  );
});

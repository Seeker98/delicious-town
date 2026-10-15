import { shallowRef, watch } from 'vue';
import { cachedChangelog, loadChangelog, type ChangelogTexts } from '../i18n/changelog';
import { useLocaleStore } from '../stores/locale';

/** 当前语言的更新记录文案（分包按需加载）：还没加载到时为 null，切换语言后跟着换 */
export function useChangelog() {
  const s = useLocaleStore();
  const texts = shallowRef<ChangelogTexts | null>(cachedChangelog(s.locale) ?? null);
  watch(
    () => s.locale,
    async (l) => {
      try {
        const got = await loadChangelog(l);
        if (s.locale === l) texts.value = got;
      } catch {
        // 部署后旧分包没了：保留已有的文案，下次进来再加载
      }
    },
    { immediate: true },
  );
  return texts;
}

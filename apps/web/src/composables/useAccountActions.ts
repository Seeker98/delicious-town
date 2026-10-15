import { useRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useConfirmStore } from '../stores/confirm';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { useT } from './useT';

/** 账号页、切换区服页共用：重发验证邮件、确认后退出登录 */
export function useAccountActions() {
  const session = useSessionStore();
  const toast = useToastStore();
  const confirm = useConfirmStore();
  const router = useRouter();
  const t = useT();

  async function resend() {
    try {
      await endpoints.sendVerifyEmail();
      toast.push(t.value.account.verifySent, 'success');
    } catch (e) {
      toast.push(errorMessage(e, t.value.account.sendFailed), 'danger');
    }
  }
  async function logout() {
    if (!(await confirm.ask({ title: t.value.account.logoutAsk, ok: t.value.account.logout, danger: true })))
      return;
    await session.logout();
    await router.replace({ name: 'login' });
  }
  return { resend, logout };
}

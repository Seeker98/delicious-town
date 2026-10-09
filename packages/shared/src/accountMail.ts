import { DEFAULT_LOCALE, isLocale, type Locale } from './locale';

/** 发到邮箱的账号邮件（问题记录 272）：按账号语言选；没选过语言用简中 */
interface AccountMailText {
  subject: string;
  text: (link: string) => string;
}
export const ACCOUNT_MAILS: Record<Locale, Record<'verify' | 'reset', AccountMailText>> = {
  'zh-CN': {
    verify: {
      subject: '美味小镇：验证你的邮箱',
      text: (link) => `欢迎来到美味小镇！请在 24 小时内打开下面的链接完成邮箱验证：\n${link}`,
    },
    reset: {
      subject: '美味小镇：重置密码',
      text: (link) => `请在 1 小时内打开下面的链接重置密码 (如果不是你本人操作，请忽略这封邮件)：\n${link}`,
    },
  },
  'zh-TW': {
    verify: {
      subject: '美味小鎮：驗證你的信箱',
      text: (link) => `歡迎來到美味小鎮！請在 24 小時內打開下面的連結完成信箱驗證：\n${link}`,
    },
    reset: {
      subject: '美味小鎮：重設密碼',
      text: (link) => `請在 1 小時內打開下面的連結重設密碼 (如果不是你本人操作，請忽略這封郵件)：\n${link}`,
    },
  },
  en: {
    verify: {
      subject: 'Delicious Town: verify your email',
      text: (link) =>
        `Welcome to Delicious Town! Open the link below within 24 hours to verify your email:\n${link}`,
    },
    reset: {
      subject: 'Delicious Town: reset your password',
      text: (link) =>
        `Open the link below within 1 hour to reset your password (if you didn't ask for this, you can ignore this email):\n${link}`,
    },
  },
  fr: {
    verify: {
      subject: 'Delicious Town\u202f: vérifiez votre e-mail',
      text: (link) =>
        `Bienvenue à Delicious Town\u202f! Ouvrez le lien ci-dessous dans les 24 heures pour vérifier votre e-mail\u202f:\n${link}`,
    },
    reset: {
      subject: 'Delicious Town\u202f: réinitialiser votre mot de passe',
      text: (link) =>
        `Ouvrez le lien ci-dessous dans l'heure pour réinitialiser votre mot de passe (si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail)\u202f:\n${link}`,
    },
  },
  es: {
    verify: {
      subject: 'Delicious Town: verifica tu correo',
      text: (link) =>
        `¡Bienvenido a Delicious Town! Abre el enlace de abajo en 24 horas para verificar tu correo:\n${link}`,
    },
    reset: {
      subject: 'Delicious Town: restablecer la contraseña',
      text: (link) =>
        `Abre el enlace de abajo en 1 hora para restablecer tu contraseña (si no lo has pedido tú, ignora este correo):\n${link}`,
    },
  },
};

export function accountMail(lang: unknown, purpose: 'verify' | 'reset', link: string) {
  const m = ACCOUNT_MAILS[isLocale(lang) ? lang : DEFAULT_LOCALE][purpose];
  return { subject: m.subject, text: m.text(link) };
}

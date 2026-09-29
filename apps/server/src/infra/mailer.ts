import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

export interface MemoryMailer extends Mailer {
  readonly sent: MailMessage[];
  lastTo(to: string): MailMessage | undefined;
}

export function smtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    async send(msg) {
      await transport.sendMail({ from, ...msg });
    },
  };
}

/** 测试用：只记录，不发送 */
export function memoryMailer(): MemoryMailer {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(msg) {
      sent.push(msg);
    },
    lastTo(to) {
      return [...sent].reverse().find((m) => m.to === to);
    },
  };
}

// Email sending for product mail (its-your-turn nudges, invites). A no-op
// interface today: the by-turns email hook lands later and only this
// implementation changes.

export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

export class NoopEmailSender implements EmailSender {
  async send(to: string, subject: string, body: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[email] would send to ${to}: ${subject}\n${body}`);
  }
}

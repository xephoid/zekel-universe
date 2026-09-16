// Email sending behind one thin interface. Sign-in links and by-turns
// nudges are the only two emails in v0. The provider is a config choice:
// Resend when RESEND_API_KEY is set, the console otherwise.

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Development mailer: prints the mail so anyone can complete the flow. */
export class ConsoleMailer implements Mailer {
  public sent: Mail[] = [];
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    // eslint-disable-next-line no-console
    console.log(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
  }
}

/** Resend transport over its HTTP API. */
export class ResendMailer implements Mailer {
  constructor(private apiKey: string, private from: string) {}

  async send(mail: Mail): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) {
      throw new Error(`Resend refused the mail: ${res.status} ${await res.text()}`);
    }
  }
}

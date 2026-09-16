import { useState } from 'react';
import { api } from '../api';
import { Nav } from './Home';

export function SignInPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <Nav />
      <div className="page" style={{ maxWidth: 440 }}>
        <h1>Sign in</h1>
        <p style={{ color: 'var(--fg-muted)' }}>
          Passwordless. We email you a link; clicking it signs you in. Playing
          against AI never needs an account.
        </p>
        {sent ? (
          <p>Link sent to <strong>{email}</strong>. Check your inbox.</p>
        ) : (
          <>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
            <button className="btn" onClick={() => {
              api.signInEmail(email).then(() => setSent(true)).catch((e) => setErr(String(e)));
            }}>Email me a sign-in link</button>
          </>
        )}
      </div>
    </div>
  );
}

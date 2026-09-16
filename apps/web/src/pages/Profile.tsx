import { Nav } from './Home';

export function ProfilePage() {
  return (
    <div>
      <Nav />
      <div className="page">
        <h1>Profile</h1>
        <p style={{ color: 'var(--fg-muted)' }}>
          Display name, avatar, bio, games played and friends. The profile API
          fills this in once the server is running.
        </p>
      </div>
    </div>
  );
}

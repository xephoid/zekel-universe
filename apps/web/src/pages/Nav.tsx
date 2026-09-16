import { Link } from 'react-router-dom';
import { useSession } from '../session';

export function Nav() {
  const { displayName, signedIn } = useSession();
  return (
    <nav className="topnav">
      <Link to="/" className="brand" aria-label="zekel home">ze<span className="meeple">k</span>el</Link>
      <Link to="/">Games</Link>
      <Link to="/gallery">Gallery</Link>
      <span className="spacer" />
      {signedIn ? (
        <Link to="/profile">{displayName || 'Profile'}</Link>
      ) : (
        <>
          {displayName && <span className="muted">{displayName}</span>}
          <Link to="/signin">Sign in</Link>
        </>
      )}
    </nav>
  );
}

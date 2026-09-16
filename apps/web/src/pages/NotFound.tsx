import { Link } from 'react-router-dom';
import { Nav } from './Nav';

export function NotFoundPage() {
  return (
    <div>
      <Nav />
      <div className="page">
        <h1>Nothing here</h1>
        <p className="muted">That page does not exist. <Link to="/">Back to the games</Link></p>
      </div>
    </div>
  );
}

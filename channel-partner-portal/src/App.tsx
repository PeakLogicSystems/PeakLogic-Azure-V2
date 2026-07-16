import { PartnerLogin } from '@/pages/PartnerLogin';

// Single-screen demo for now -- UX Wireframes §2.12-2.15 (territory
// editor, technician management, daily dispatch route) are approved but
// not built here. The user's explicit ask was specifically "what the
// channel partner login page would look like" for an investor demo, not
// the full post-login portal -- scoped intentionally, not an oversight.
// Real routing (react-router-dom is already a dependency, matching
// frontend/'s convention) is a straightforward next step once there's a
// second screen to route to.
export function App() {
  return <PartnerLogin />;
}

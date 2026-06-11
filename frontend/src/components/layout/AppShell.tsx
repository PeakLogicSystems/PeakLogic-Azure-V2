import type { ReactNode } from 'react';
import type { AuthUser } from 'aws-amplify/auth';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  children: ReactNode;
  user: AuthUser;
  onSignOut: () => void;
}

export function AppShell({ children, user, onSignOut }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onSignOut={onSignOut} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

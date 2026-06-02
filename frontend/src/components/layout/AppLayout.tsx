import { Outlet, Link, useLocation } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useScopedLinkBuilder } from '@/lib/url-state';

/** Persistent chat launcher shown on every page (except /chat itself). */
function ChatFab() {
  const buildLink = useScopedLinkBuilder();
  const { pathname } = useLocation();
  if (pathname.startsWith('/chat')) return null;
  return (
    <Link
      to={buildLink('/chat')}
      aria-label="Open chat assistant"
      title="Ask the assistant"
      className="fixed bottom-6 right-6 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/5 transition hover:scale-105 hover:opacity-95"
    >
      <MessageSquare className="h-5 w-5" />
    </Link>
  );
}

export function AppLayout() {
  return (
    <div className="h-svh flex flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 md:px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
      <ChatFab />
    </div>
  );
}

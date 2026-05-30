import { NavLink } from 'react-router-dom';
import { Activity, History } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Dashboard', icon: Activity, end: true },
  { to: '/history', label: 'History', icon: History, end: false },
];

export function Sidebar() {
  return (
    <aside className="border-r bg-sidebar text-sidebar-foreground w-56 shrink-0 hidden md:flex flex-col">
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground',
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-3 text-xs text-sidebar-foreground/60 border-t">
        Amazon Discovery Intelligence
      </div>
    </aside>
  );
}

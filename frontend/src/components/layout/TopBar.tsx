import { Link } from 'react-router-dom';
import { FileText, ListChecks, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { groupColor } from '@/lib/colors';
import { featureGroupName } from '@/lib/parsers';
import { useActiveGroup, usePageTitle, useScopedLinkBuilder } from '@/lib/url-state';
import { RunPipelineDialog } from '@/components/run-pipeline/RunPipelineDialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { SourceToggle } from '@/components/layout/SourceToggle';

const PAGES = [
  { to: '/digest', label: 'Digest', icon: FileText },
  { to: '/signals', label: 'Signals', icon: ListChecks },
  { to: '/report', label: 'Report', icon: BarChart3 },
];

export function TopBar() {
  const activeGroup = useActiveGroup();
  const pageTitle = usePageTitle();
  const buildLink = useScopedLinkBuilder();

  const groupLabel = activeGroup === 'all' ? 'All Groups' : featureGroupName(activeGroup);
  const groupColorInfo = activeGroup === 'all' ? { hex: '#64748b' } : groupColor(activeGroup);

  return (
    <header className="border-b bg-background/90 backdrop-blur sticky top-0 z-30">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <h1 className="text-sm font-semibold mr-1">{pageTitle}</h1>

        <nav className="flex items-center gap-1 ml-2">
          {PAGES.map((p) => {
            const Icon = p.icon;
            const isActive = pageTitle === ({ '/digest': 'Digest', '/signals': 'Signals', '/report': 'Discovery Report' } as Record<string, string>)[p.to];
            return (
              <Link
                key={p.to}
                to={buildLink(p.to)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                )}
              >
                <Icon className="h-3 w-3" />
                {p.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-3">
          <SourceToggle />
        </div>

        <div className="mx-auto">
          <span
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              backgroundColor: `${groupColorInfo.hex}1f`,
              color: groupColorInfo.hex,
            }}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: groupColorInfo.hex }} aria-hidden />
            {groupLabel}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <RunPipelineDialog />
        </div>
      </div>
    </header>
  );
}

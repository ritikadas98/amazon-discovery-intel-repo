import { Link } from 'react-router-dom';
import { FileText, ListChecks, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { groupColor } from '@/lib/colors';
import { featureGroupName } from '@/lib/parsers';
import { MobileGroupPicker } from './MobileGroupPicker';
import { useActiveGroup, usePageTitle, useScopedLinkBuilder } from '@/lib/url-state';
import { RunPipelineDialog } from '@/components/run-pipeline/RunPipelineDialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { SourceToggle } from '@/components/layout/SourceToggle';

/**
 * Named for what each page answers, not for what it is called internally.
 *
 * "Digest" is a publishing word, and "Signals" is the pipeline's word for a
 * customer review — neither tells a first-time reader what they would find. The
 * routes are unchanged, so every existing link and bookmark still works.
 */
const PAGES = [
  { to: '/digest', label: 'This week', icon: FileText },
  { to: '/signals', label: 'What people said', icon: ListChecks },
  { to: '/report', label: 'Full detail', icon: BarChart3 },
];

export function TopBar() {
  const activeGroup = useActiveGroup();
  const pageTitle = usePageTitle();
  const buildLink = useScopedLinkBuilder();

  const groupLabel = activeGroup === 'all' ? 'All Groups' : featureGroupName(activeGroup);
  const groupColorInfo = activeGroup === 'all' ? { hex: '#64748b' } : groupColor(activeGroup);

  return (
    <header className="border-b bg-background/90 backdrop-blur sticky top-0 z-30">
      {/* One row from md up. On a phone it splits: navigation and controls on
          top, scope underneath. Everything used to sit on a single 56px row,
          which pushed the theme toggle and Run pipeline off the right edge
          where they could not be reached at all. */}
      <div className="flex flex-col gap-2 px-4 py-2 md:h-14 md:flex-row md:items-center md:gap-3 md:py-0 md:px-6">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          {/* Duplicates the active tab on a phone, where space is the scarce thing. */}
          <h1 className="mr-1 hidden text-sm font-semibold md:block">{pageTitle}</h1>

          <nav className="flex items-center gap-1 md:ml-2">
          {PAGES.map((p) => {
            const Icon = p.icon;
            const isActive = pageTitle === ({ '/digest': 'This week', '/signals': 'What people said', '/report': 'Full detail' } as Record<string, string>)[p.to];
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
                <Icon className="h-3 w-3 shrink-0" />
                {/* The label wrapped to three lines at 390px. The icon plus the
                    active-state background is enough to navigate by there. */}
                <span className="hidden sm:inline">{p.label}</span>
                <span className="sr-only sm:hidden">{p.label}</span>
              </Link>
            );
          })}
          </nav>

          {/* Controls stay on the first row and stay reachable. */}
          <div className="ml-auto flex shrink-0 items-center gap-1 md:hidden">
            <ThemeToggle />
            <RunPipelineDialog />
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 md:contents">
          <div className="shrink-0 md:ml-3">
            <SourceToggle />
          </div>

          <MobileGroupPicker />

          {/* The chip is a label, not a control — the picker replaces it on a
              phone, so showing both would be the same fact twice. */}
          <div className="hidden md:mx-auto md:block">
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

          <div className="hidden items-center gap-1 md:flex">
            <ThemeToggle />
            <RunPipelineDialog />
          </div>
        </div>
      </div>
    </header>
  );
}

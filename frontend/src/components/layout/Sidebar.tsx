import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { groupColor } from '@/lib/colors';
import { FEATURE_GROUP_NAMES, featureGroupName, formatWeekLabel, rowSource } from '@/lib/parsers';
import { useActiveGroup, useActiveSource, useActiveWeek, useScopedLinkBuilder, useSetParam } from '@/lib/url-state';
import { api } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NAV_BASE = '/digest';

interface NavTarget {
  id: string;
  label: string;
}

const ALL_TARGET: NavTarget = { id: 'all', label: 'All Groups' };
const NAV_TARGETS: NavTarget[] = Object.entries(FEATURE_GROUP_NAMES).map(([id, label]) => ({ id, label }));

function formatLastRun(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Sidebar() {
  const activeGroup = useActiveGroup();
  const activeWeek = useActiveWeek();
  const activeSource = useActiveSource();
  const buildLink = useScopedLinkBuilder();
  const setParam = useSetParam();
  const location = useLocation();

  // Weeks dropdown — last 10 runs
  const digestsQuery = useQuery({
    queryKey: ['digests', 10],
    queryFn: () => api.digests(10),
  });

  // Scope everything in the sidebar to the active data source (Sample vs Live).
  const sourceDigests = useMemo(
    () => (digestsQuery.data?.rows ?? []).filter((r) => rowSource(r['Data Source']) === activeSource),
    [digestsQuery.data, activeSource],
  );

  // Group counts derived from this week's signals
  const weekId = activeWeek ?? sourceDigests[0]?.['Week ID'];
  const signalsQuery = useQuery({
    queryKey: ['signals', 'all', weekId],
    queryFn: () => api.signalsForWeek(weekId!),
    enabled: !!weekId,
  });

  const sourceSignals = useMemo(
    () => (signalsQuery.data?.rows ?? []).filter((r) => rowSource(r['Data Source']) === activeSource),
    [signalsQuery.data, activeSource],
  );

  const countsByGroup = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of sourceSignals) {
      const id = row['Feature Group ID'];
      if (!id) continue;
      map[id] = (map[id] ?? 0) + 1;
    }
    return map;
  }, [sourceSignals]);

  const totalSignals = sourceSignals.length;

  // Each run appends a Weekly Digests row, so the same week can appear many
  // times. Dedupe to one option per week (newest first) for the week selector.
  const uniqueWeeks = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of sourceDigests) {
      const w = row['Week ID'];
      if (w && !seen.has(w)) {
        seen.add(w);
        out.push(w);
      }
    }
    return out;
  }, [sourceDigests]);

  const lastRunIso = sourceDigests[0]?.['Created At'];

  // The route doesn't always live under /digest. Highlight nav by group only,
  // while leaving the user on whichever page they're on (clicking nav swaps group).
  const onDigestRoute = location.pathname.startsWith('/digest');
  const targetPath = onDigestRoute ? NAV_BASE : location.pathname;

  return (
    <aside className="border-r bg-sidebar text-sidebar-foreground w-56 shrink-0 hidden md:flex flex-col">
      <div className="px-4 py-4 border-b">
        <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60 font-medium">
          Amazon Discovery
        </p>
        <p className="text-sm font-semibold mt-0.5">Intelligence</p>
      </div>

      <div className="px-3 pt-4 pb-3">
        <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60 font-medium mb-1.5 px-1">
          Week
        </p>
        <Select
          value={activeWeek ?? sourceDigests[0]?.['Week ID'] ?? ''}
          onValueChange={(v) => setParam('week', v || null)}
        >
          <SelectTrigger className="w-full h-8 text-xs">
            <SelectValue placeholder="Latest" />
          </SelectTrigger>
          <SelectContent>
            {uniqueWeeks.map((week) => (
              <SelectItem key={week} value={week} className="text-xs">
                {formatWeekLabel(week)}
              </SelectItem>
            ))}
            {uniqueWeeks.length === 0 && (
              <SelectItem value="none" disabled className="text-xs">
                No runs yet
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      <nav className="flex-1 px-3 pb-4 overflow-y-auto">
        <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60 font-medium mt-2 mb-1.5 px-1">
          Feature Groups
        </p>

        <NavItem
          to={buildLink(targetPath, { group: ALL_TARGET.id })}
          label={ALL_TARGET.label}
          color="#64748b"
          icon={<Layers className="h-3.5 w-3.5" />}
          count={totalSignals}
          isActive={activeGroup === 'all'}
        />

        <div className="my-1.5 border-t border-sidebar-border/50" />

        {NAV_TARGETS.map((t) => (
          <NavItem
            key={t.id}
            to={buildLink(targetPath, { group: t.id })}
            label={featureGroupName(t.id)}
            color={groupColor(t.id).hex}
            count={countsByGroup[t.id] ?? 0}
            isActive={activeGroup === t.id}
          />
        ))}
      </nav>

      <div className="border-t px-4 py-3 text-[11px] text-sidebar-foreground/60">
        <span className="block text-[10px] uppercase tracking-wider opacity-70">Pipeline last run</span>
        <span className="text-sidebar-foreground/80">{formatLastRun(lastRunIso ?? '')}</span>
      </div>
    </aside>
  );
}

interface NavItemProps {
  to: string;
  label: string;
  color: string;
  count?: number;
  icon?: React.ReactNode;
  isActive: boolean;
}

function NavItem({ to, label, color, count, icon, isActive }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={cn(
        'flex items-center gap-2 rounded-md pl-2 pr-2 py-1.5 text-sm font-medium transition-colors',
        'border-l-2',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'border-transparent hover:bg-sidebar-accent/50 text-sidebar-foreground/85',
      )}
      style={isActive ? { borderLeftColor: color } : undefined}
    >
      <span
        className="inline-block h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {icon}
      <span className="truncate flex-1">{label}</span>
      {typeof count === 'number' && (
        <span className="text-[10px] tabular-nums text-sidebar-foreground/60 bg-sidebar-accent/40 rounded-full px-1.5 py-0.5 min-w-[1.5rem] text-center">
          {count}
        </span>
      )}
    </NavLink>
  );
}

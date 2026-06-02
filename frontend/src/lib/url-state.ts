import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';

/** "all" sentinel = the cross-group Lead PM view. */
export type GroupParam = 'all' | string;

export function useActiveGroup(): GroupParam {
  const [params] = useSearchParams();
  const group = params.get('group');
  return group && group.length > 0 ? group : 'all';
}

export function useActiveWeek(): string | null {
  const [params] = useSearchParams();
  return params.get('week');
}

/** Data provenance toggle: 'sample' (curated fixture) or 'live' (real ingestion).
 *  Defaults to 'live' — always shows whatever data exists (untagged/legacy rows
 *  read as live), so the dashboard is never unexpectedly empty; the demo flips to
 *  'sample' intentionally to show the analysis on the curated dataset. */
export type SourceParam = 'sample' | 'live';
export function useActiveSource(): SourceParam {
  const [params] = useSearchParams();
  return (params.get('source') || '').toLowerCase() === 'sample' ? 'sample' : 'live';
}

/**
 * Build a URL that preserves the current group/week selection across pages.
 * Used by the sidebar nav and top-bar links.
 */
export function useScopedLinkBuilder(): (path: string, overrides?: { group?: GroupParam | null; week?: string | null }) => string {
  const [params] = useSearchParams();
  return (path, overrides = {}) => {
    const next = new URLSearchParams(params);
    const group = overrides.group !== undefined ? overrides.group : next.get('group');
    const week = overrides.week !== undefined ? overrides.week : next.get('week');
    next.delete('group');
    next.delete('week');
    if (group !== null && group !== undefined) next.set('group', group);
    if (week !== null && week !== undefined) next.set('week', week);
    const query = next.toString();
    return query ? `${path}?${query}` : path;
  };
}

/** Imperative: change just one search param without leaving the current page. */
export function useSetParam(): (key: string, value: string | null) => void {
  const [params, setParams] = useSearchParams();
  return (key, value) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
}

/** Page title sourced from the current pathname. */
export function usePageTitle(): string {
  const location = useLocation();
  if (location.pathname.startsWith('/signals')) return 'Signals';
  if (location.pathname.startsWith('/report')) return 'Discovery Report';
  if (location.pathname.startsWith('/chat')) return 'Chat';
  if (location.pathname.startsWith('/digest')) return 'Digest';
  return 'Dashboard';
}

/** Imperative navigation that preserves URL params. */
export function useScopedNavigate(): (path: string) => void {
  const navigate = useNavigate();
  const build = useScopedLinkBuilder();
  return (path) => navigate(build(path));
}

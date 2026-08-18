import { useNavigate, useLocation } from 'react-router-dom';
import { FEATURE_GROUP_NAMES } from '@/lib/parsers';
import { groupColor } from '@/lib/colors';
import { useActiveGroup, useScopedLinkBuilder } from '@/lib/url-state';

/**
 * Group navigation for phones.
 *
 * The sidebar is `hidden md:flex`, and nothing stood in for it — so on a phone
 * there was no way to reach a feature group at all. Every group page was
 * unreachable unless you typed the URL.
 *
 * A native select rather than a drawer: it costs no new dependency, opens as
 * the platform's own picker, and is reachable one-handed. Seven groups do not
 * need a custom menu.
 *
 * The report has no "all groups" view — it filters themes by group — so
 * choosing it there moves to the digest, matching what the sidebar does.
 */
export function MobileGroupPicker() {
  const activeGroup = useActiveGroup();
  const navigate = useNavigate();
  const location = useLocation();
  const buildLink = useScopedLinkBuilder();

  const colour = activeGroup === 'all' ? '#64748b' : groupColor(activeGroup).hex;
  const onReport = location.pathname.startsWith('/report');

  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
      <span className="sr-only">Part of the app</span>
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: colour }}
        aria-hidden
      />
      <select
        value={activeGroup}
        onChange={(e) => {
          const next = e.target.value;
          const path = next === 'all' && onReport ? '/digest' : location.pathname;
          navigate(buildLink(path, { group: next }));
        }}
        className="min-w-0 flex-1 truncate rounded-md border bg-background px-2 py-1 text-xs font-medium"
      >
        <option value="all">All Groups</option>
        {Object.entries(FEATURE_GROUP_NAMES).map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

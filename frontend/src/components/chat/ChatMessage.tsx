import * as React from 'react';
import { Link } from 'react-router-dom';
import type { SignalRow } from '@/types';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useScopedLinkBuilder } from '@/lib/url-state';

export interface ChatMessageData {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatMessageProps {
  message: ChatMessageData;
  signalsById: Map<string, SignalRow>;
  accentHex: string;
  /** True while the assistant message is still streaming (shows a caret). */
  streaming?: boolean;
}

// Match a signal ID (weekId-index, e.g. 2026-W23-80), optionally wrapped in the
// model's "[signal <ID>]" / "signal <ID>" form. The shape match alone is NOT a
// citation — an ID that doesn't resolve against the scoped signals is treated as
// unverified (A5), so a fabricated ID can't masquerade as a real footnote.
const CITATION_RE = /(?:\[\s*signal\s+|signal\s+)?(\d{4}-W\d{1,2}-\d+)\]?/gi;

type BuildLink = ReturnType<typeof useScopedLinkBuilder>;

type Token = { type: 'text'; value: string } | { type: 'cite'; value: string };

/** Split assistant text into plain-text runs and citation-ID tokens. */
function tokenize(content: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(content)) !== null) {
    if (m.index > lastIndex) tokens.push({ type: 'text', value: content.slice(lastIndex, m.index) });
    tokens.push({ type: 'cite', value: m[1].trim() });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) tokens.push({ type: 'text', value: content.slice(lastIndex) });
  return tokens;
}

/** Count distinct citation IDs an assistant reply emitted, and how many resolve
 *  against the scoped signals. Shared by the in-bubble rendering and the online
 *  eval POST so both report the same numbers. */
export function countCitations(
  content: string,
  signalsById: Map<string, SignalRow>,
): { total: number; resolved: number } {
  const seen = new Set<string>();
  const resolved = new Set<string>();
  for (const t of tokenize(content)) {
    if (t.type !== 'cite') continue;
    seen.add(t.value);
    if (signalsById.has(t.value)) resolved.add(t.value);
  }
  return { total: seen.size, resolved: resolved.size };
}

/** A resolved citation: a compact [n] badge that opens a popover with the full
 *  signal text + a link into the Signals browser. Only rendered when the ID
 *  actually exists in the scoped corpus. */
function Citation({
  id,
  num,
  signal,
  accentHex,
  buildLink,
}: {
  id: string;
  num: number;
  signal: SignalRow;
  accentHex: string;
  buildLink: BuildLink;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mx-0.5 inline-flex items-center rounded px-1 align-baseline text-[10px] font-semibold leading-none cursor-pointer"
          style={{ backgroundColor: `${accentHex}22`, color: accentHex }}
          aria-label={`Citation ${num}: signal ${id}`}
        >
          {num}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-2 text-left text-xs">
        <div className="font-mono text-[11px] text-muted-foreground">
          {id} · sev {signal['Severity Score']} · {signal.Source}
        </div>
        <p className="leading-snug whitespace-pre-wrap">{signal.Text}</p>
        <Link
          to={buildLink('/signals', { group: signal['Feature Group ID'] || undefined })}
          className="inline-block text-[11px] font-medium text-primary underline underline-offset-2"
        >
          Open in Signals →
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/** An unresolved citation: the model emitted a signal-ID-shaped token that is
 *  NOT in the scoped corpus. Rendered as a visually distinct, non-numbered
 *  warning chip so it can't pass as a real footnote (A5). */
function UnresolvedCitation({ id }: { id: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mx-0.5 inline-flex items-center gap-0.5 rounded border border-dashed border-amber-500/60 px-1 align-baseline text-[10px] font-medium leading-none text-amber-600 dark:text-amber-400 cursor-help"
          aria-label={`Unverified citation: signal ${id} was not found in scope`}
        >
          <span aria-hidden>⚠</span>
          <span className="font-mono">{id}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-1 text-left text-xs">
        <div className="font-medium text-amber-600 dark:text-amber-400">Unverified citation</div>
        <p className="leading-snug">
          Signal <span className="font-mono">{id}</span> isn't among the signals the assistant was
          given for this scope. It may be out of scope or fabricated — treat it as uncited, not as
          evidence.
        </p>
      </PopoverContent>
    </Popover>
  );
}

interface RenderedMessage {
  nodes: React.ReactNode[];
  /** Distinct citation IDs the model emitted. */
  total: number;
  /** Distinct citation IDs that resolved against the scoped corpus. */
  resolved: number;
}

/** Turn assistant text into nodes, verifying every citation ID against the
 *  scoped signals. Resolved IDs get sequential footnote numbers; unresolved
 *  IDs get a warning chip and are excluded from the numbering. */
function renderMessage(
  content: string,
  signalsById: Map<string, SignalRow>,
  accentHex: string,
  buildLink: BuildLink,
): RenderedMessage {
  const tokens = tokenize(content);
  const footnoteNums = new Map<string, number>();
  const seen = new Set<string>();
  const resolvedIds = new Set<string>();
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (const t of tokens) {
    if (t.type === 'text') {
      nodes.push(<span key={key++}>{t.value}</span>);
      continue;
    }
    const id = t.value;
    seen.add(id);
    const signal = signalsById.get(id);
    if (signal) {
      resolvedIds.add(id);
      if (!footnoteNums.has(id)) footnoteNums.set(id, footnoteNums.size + 1);
      nodes.push(
        <Citation
          key={key++}
          id={id}
          num={footnoteNums.get(id)!}
          signal={signal}
          accentHex={accentHex}
          buildLink={buildLink}
        />,
      );
    } else {
      nodes.push(<UnresolvedCitation key={key++} id={id} />);
    }
  }

  return { nodes, total: seen.size, resolved: resolvedIds.size };
}

export function ChatMessage({ message, signalsById, accentHex, streaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const buildLink = useScopedLinkBuilder();

  const rendered = React.useMemo(
    () =>
      isUser
        ? null
        : renderMessage(message.content, signalsById, accentHex, buildLink),
    [isUser, message.content, signalsById, accentHex, buildLink],
  );

  const total = rendered?.total ?? 0;
  const resolved = rendered?.resolved ?? 0;

  // Online eval: log citation-resolution rate once per completed assistant turn.
  const loggedRef = React.useRef(false);
  React.useEffect(() => {
    if (isUser || streaming || total === 0 || loggedRef.current) return;
    loggedRef.current = true;
    const rate = resolved / total;
    console.debug(
      `[chat] citation_resolution_rate=${rate.toFixed(2)} (${resolved}/${total} resolved)`,
    );
  }, [isUser, streaming, total, resolved]);

  const showFooter = !isUser && !streaming && total > 0;

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[80%]', isUser ? '' : 'space-y-1')}>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
            isUser ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-foreground',
          )}
        >
          {isUser ? message.content : rendered!.nodes}
          {streaming && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-foreground/60" aria-hidden />
          )}
        </div>
        {showFooter && (
          <div
            className={cn(
              'px-1 text-[10px]',
              resolved < total ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
            )}
          >
            {resolved}/{total} cited signal{total === 1 ? '' : 's'} verified
          </div>
        )}
      </div>
    </div>
  );
}

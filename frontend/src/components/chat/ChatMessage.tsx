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
// model's "[signal <ID>]" / "signal <ID>" form.
const CITATION_RE = /(?:\[\s*signal\s+|signal\s+)?(\d{4}-W\d{1,2}-\d+)\]?/gi;

type BuildLink = ReturnType<typeof useScopedLinkBuilder>;

/** A footnote-style citation: a compact [n] badge that opens a popover with the
 *  full signal text + a link into the Signals browser. */
function Citation({
  id,
  num,
  signal,
  accentHex,
  buildLink,
}: {
  id: string;
  num: number;
  signal?: SignalRow;
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
        {signal ? (
          <>
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
          </>
        ) : (
          <p>
            Signal <span className="font-mono">{id}</span> isn't in the current view.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Replace [signal <ID>] / bare IDs with footnote-numbered citations ([1], [2]…)
 *  in order of first appearance. */
function renderWithCitations(
  content: string,
  signalsById: Map<string, SignalRow>,
  accentHex: string,
  buildLink: BuildLink,
): React.ReactNode[] {
  const order = new Map<string, number>();
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(content)) !== null) {
    if (m.index > lastIndex) {
      nodes.push(<span key={key++}>{content.slice(lastIndex, m.index)}</span>);
    }
    const id = m[1].trim();
    if (!order.has(id)) order.set(id, order.size + 1);
    nodes.push(
      <Citation
        key={key++}
        id={id}
        num={order.get(id)!}
        signal={signalsById.get(id)}
        accentHex={accentHex}
        buildLink={buildLink}
      />,
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) {
    nodes.push(<span key={key++}>{content.slice(lastIndex)}</span>);
  }
  return nodes;
}

export function ChatMessage({ message, signalsById, accentHex, streaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const buildLink = useScopedLinkBuilder();
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
          isUser ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-foreground',
        )}
      >
        {isUser
          ? message.content
          : renderWithCitations(message.content, signalsById, accentHex, buildLink)}
        {streaming && (
          <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-foreground/60" aria-hidden />
        )}
      </div>
    </div>
  );
}

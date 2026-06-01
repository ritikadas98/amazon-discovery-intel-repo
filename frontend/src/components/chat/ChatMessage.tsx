import * as React from 'react';
import type { SignalRow } from '@/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
// model's preferred "[signal <ID>]" form. The model isn't perfectly consistent —
// it sometimes writes a bare ID or "signal <ID>" — so we badge any ID-shaped token
// and absorb the optional "[signal "/"signal " prefix and trailing "]".
const CITATION_RE = /(?:\[\s*signal\s+|signal\s+)?(\d{4}-W\d{1,2}-\d+)\]?/gi;

function Citation({ id, signal, accentHex }: { id: string; signal?: SignalRow; accentHex: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="mx-0.5 inline-flex items-center rounded px-1 py-0 align-baseline font-mono text-[11px] font-medium leading-none cursor-default"
          style={{ backgroundColor: `${accentHex}1f`, color: accentHex }}
        >
          {id}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-normal text-left">
        {signal ? (
          <span>
            <span className="font-mono opacity-70">{id}</span> · sev {signal['Severity Score']} ·{' '}
            {signal.Source}
            <br />
            {signal.Text.length > 240 ? signal.Text.slice(0, 240) + '…' : signal.Text}
          </span>
        ) : (
          <span>
            Signal <span className="font-mono">{id}</span> is not in the current group/week view.
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Split assistant text on [signal <ID>] citations, rendering each as a badge. */
function renderWithCitations(
  content: string,
  signalsById: Map<string, SignalRow>,
  accentHex: string,
): React.ReactNode[] {
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
    nodes.push(<Citation key={key++} id={id} signal={signalsById.get(id)} accentHex={accentHex} />);
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) {
    nodes.push(<span key={key++}>{content.slice(lastIndex)}</span>);
  }
  return nodes;
}

export function ChatMessage({ message, signalsById, accentHex, streaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
          isUser ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-foreground',
        )}
      >
        {isUser ? message.content : renderWithCitations(message.content, signalsById, accentHex)}
        {streaming && (
          <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-foreground/60" aria-hidden />
        )}
      </div>
    </div>
  );
}

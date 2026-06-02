import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, Square, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatMessage } from '@/components/chat/ChatMessage';
import type { ChatMessageData } from '@/components/chat/ChatMessage';
import { api, chatStream } from '@/lib/api';
import type { ChatTurn } from '@/lib/api';
import type { SignalRow } from '@/types';
import { useActiveGroup, useActiveSource, useActiveWeek } from '@/lib/url-state';
import { groupColor } from '@/lib/colors';
import { featureGroupName, rowSource } from '@/lib/parsers';

const SUGGESTIONS = [
  'What are the top complaints in scope this week?',
  'Which themes are worsening, and why?',
  'Summarise the discovery readiness for this group.',
];

export function ChatPage() {
  const group = useActiveGroup();
  const weekParam = useActiveWeek();
  const activeSource = useActiveSource();

  // Resolve a week to scope context + citations (fall back to the latest run
  // of the active source).
  const digestsQuery = useQuery({
    queryKey: ['digests', 20],
    queryFn: () => api.digests(20),
    enabled: !weekParam,
  });
  const latestSourceWeek = (digestsQuery.data?.rows ?? []).find(
    (r) => rowSource(r['Data Source']) === activeSource,
  )?.['Week ID'];
  const weekId = weekParam ?? latestSourceWeek ?? null;

  // Signals in scope — used to resolve [signal <ID>] citations to their text.
  // Filtered by the active source so citations match the data chat reasons over.
  const signalsQuery = useQuery({
    queryKey: ['signals', group, weekId],
    queryFn: () =>
      group === 'all' ? api.signalsForWeek(weekId!) : api.signalsForGroup(weekId!, group),
    enabled: !!weekId,
  });
  const signalsById = useMemo(() => {
    const rows = (signalsQuery.data?.rows ?? []).filter(
      (r) => rowSource(r['Data Source']) === activeSource,
    );
    const map = new Map<string, SignalRow>();
    for (const r of rows) map.set(r.ID, r);
    return map;
  }, [signalsQuery.data, activeSource]);

  const accentHex = group === 'all' ? '#64748b' : groupColor(group).hex;
  const scopeLabel = group === 'all' ? 'All Groups' : featureGroupName(group);

  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || streaming) return;

    const history: ChatTurn[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: message },
      { role: 'assistant', content: '' },
    ]);
    setInput('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const appendToAssistant = (delta: string) =>
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = { ...last, content: last.content + delta };
        }
        return next;
      });

    void chatStream(
      {
        message,
        history,
        group: group === 'all' ? undefined : group,
        week: weekId ?? undefined,
        source: activeSource,
      },
      {
        onToken: appendToAssistant,
        onError: (msg) => {
          toast.error(msg);
          appendToAssistant(`\n\n_(error: ${msg})_`);
          setStreaming(false);
        },
        onDone: () => setStreaming(false),
        signal: controller.signal,
      },
    );
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[calc(100svh-7rem)]">
        <div className="flex items-center gap-2 pb-3 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" style={{ color: accentHex }} />
          <span>
            Chatting over <span className="font-medium text-foreground">{scopeLabel}</span>
            {weekId ? (
              <>
                {' '}· week <span className="font-mono">{weekId}</span>
              </>
            ) : null}
            {' '}· <span className="font-medium text-foreground">{activeSource === 'sample' ? 'Sample' : 'Live'} data</span>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto rounded-lg border bg-card/40 p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <p className="text-sm text-muted-foreground max-w-md">
                Ask about the customer signals and digests in scope. Answers cite specific
                signals like <span className="font-mono text-foreground">[signal {weekId ?? '2026-W22'}-0]</span>.
              </p>
              <div className="flex flex-col gap-2 w-full max-w-md">
                {SUGGESTIONS.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    className="justify-start text-left h-auto py-2 whitespace-normal"
                    onClick={() => send(s)}
                    disabled={!weekId}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <ChatMessage
                key={i}
                message={m}
                signalsById={signalsById}
                accentHex={accentHex}
                streaming={streaming && i === messages.length - 1 && m.role === 'assistant'}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex items-center gap-2 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Input
            placeholder={weekId ? 'Ask about signals in scope…' : 'No runs yet — nothing to chat about.'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!weekId || streaming}
            autoFocus
          />
          {streaming ? (
            <Button type="button" variant="outline" onClick={stop}>
              <Square className="h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim() || !weekId}>
              <Send className="h-4 w-4" />
              Send
            </Button>
          )}
        </form>
      </div>
    </TooltipProvider>
  );
}

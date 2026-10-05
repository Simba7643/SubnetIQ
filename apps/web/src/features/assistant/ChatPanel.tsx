import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowUpRight,
  Bot,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  MessageCircle,
  Plus,
  RotateCcw,
  Send,
  Share2,
  Sparkles,
  Square,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { CalculationResult, ChatMessage, Conversation } from '@subnetiq/shared';
import { api, apiHeaders, apiUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query';
import { readEventStream } from '@/lib/stream';
import { notify } from '@/lib/notify';
import { downloadFile } from '@/lib/export';
import { Button, Badge, Card, Textarea } from '@/components/ui';
import { Markdown } from '@/components/Markdown';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type Message = ChatMessage & { id: string; mode?: string; provider?: string };
type AiStatus = {
  configured: boolean;
  provider: string;
  mode: string;
  authenticationRequired?: boolean;
  dailyLimit?: number;
  message?: string;
};
const prompts = [
  'Explain why a /26 gives 62 conventional hosts.',
  'Help me plan three departments inside a /24.',
  'When should I use /31 on a router link?',
  'Explain IPv6 compression with examples.',
];
export function ChatPanel({
  compact = false,
  initialCalculation,
}: {
  compact?: boolean;
  initialCalculation?: CalculationResult;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [context, setContext] = useState(initialCalculation);
  const [conversationId, setConversationId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [retryPrompt, setRetryPrompt] = useState('');
  const [mode, setMode] = useState('demo');
  const [provider, setProvider] = useState('mock');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  const [shareDraft, setShareDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const status = useQuery({
    queryKey: ['ai-status', user?.id],
    queryFn: () => api<AiStatus>('/ai/status'),
    staleTime: 60000,
    retry: false,
  });
  const conversations = useQuery({
    queryKey: ['conversations', user?.id],
    queryFn: () => api<Conversation[]>('/ai/conversations'),
    enabled: Boolean(user && !compact),
  });
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
  }, [messages]);
  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );
  const newConversation = () => {
    controllerRef.current?.abort();
    setMessages([]);
    setConversationId(undefined);
    setError('');
    setRetryPrompt('');
    setSelected(new Set());
    setShareOpen(false);
    setShareDraft('');
    setMode('demo');
    setProvider('mock');
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('Copied to clipboard');
    } catch {
      notify('Clipboard unavailable. Select the text and copy it.', 'error');
    }
  };
  const previewShare = () => {
    const chosen = messages.filter((message) => selected.has(message.id));
    const text = chosen
      .map(
        (message) =>
          `${message.role === 'user' ? 'You' : 'SubnetIQ assistant'}${message.mode === 'demo' ? ' (demonstration)' : ''}\n\n${message.content}`,
      )
      .join('\n\n---\n\n');
    if (!text) return;
    setShareDraft(text);
    setShareOpen(true);
  };
  const share = async () => {
    if (!shareDraft) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Selected SubnetIQ conversation messages',
          text: shareDraft,
        });
      } catch (failure) {
        if (failure instanceof Error && failure.name === 'AbortError') return;
        await copy(shareDraft);
      }
    } else await copy(shareDraft);
    setShareOpen(false);
  };
  const exportConversation = (format: 'markdown' | 'json') => {
    const completeMessages = messages.filter((message) => message.content.trim());
    if (!completeMessages.length) return;
    const exportedAt = new Date().toISOString();
    const filename = `subnetiq-conversation-${conversationId ?? 'session'}`;
    if (format === 'json')
      downloadFile(
        `${filename}.json`,
        JSON.stringify(
          {
            schemaVersion: 1,
            exportedAt,
            conversationId: conversationId ?? null,
            partialResponse: pending,
            messages: completeMessages,
            ...(context
              ? { calculation: { toolId: context.toolId, input: context.normalizedInput } }
              : {}),
          },
          null,
          2,
        ),
      );
    else {
      const text = [
        `# SubnetIQ conversation`,
        `Exported: ${exportedAt}`,
        ...(pending ? ['The final response was still streaming at export.'] : []),
        ...completeMessages.map(
          (message) =>
            `## ${message.role === 'user' ? 'You' : `SubnetIQ assistant${message.mode === 'demo' ? ' — demonstration' : ''}`}\n\n${message.content}`,
        ),
      ].join('\n\n');
      downloadFile(`${filename}.md`, text, 'text/markdown;charset=utf-8');
    }
  };
  const loadConversation = async (id: string) => {
    if (pending) return;
    try {
      const history = await api<(ChatMessage & { id: string; mode?: string; provider?: string })[]>(
        `/ai/conversations/${id}/messages`,
      );
      const lastAssistant = [...history].reverse().find((message) => message.role === 'assistant');
      setMessages(history);
      setConversationId(id);
      setContext(undefined);
      setSelected(new Set());
      setError('');
      setRetryPrompt('');
      setMode(lastAssistant?.mode ?? 'demo');
      setProvider(lastAssistant?.provider ?? 'mock');
    } catch (failure) {
      notify(
        failure instanceof Error ? failure.message : 'Conversation could not be loaded.',
        'error',
      );
    }
  };
  const send = async (prompt?: string) => {
    const text = (prompt ?? input).trim();
    if (!text || pending) return;
    if (text.length > 16000) {
      setError('Keep each message under 16,000 characters.');
      return;
    }
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const replyId = crypto.randomUUID();
    const next = [...messages.filter((message) => message.content.trim()), userMessage];
    setMessages([...next, { id: replyId, role: 'assistant', content: '' }]);
    setInput('');
    setPending(true);
    setError('');
    setRetryPrompt('');
    const controller = new AbortController();
    controllerRef.current = controller;
    let failedEvent = false;
    try {
      const response = await fetch(apiUrl('/ai/chat'), {
        method: 'POST',
        headers: await apiHeaders(),
        signal: controller.signal,
        cache: 'no-store',
        body: JSON.stringify({
          messages: (conversationId ? [userMessage] : next.slice(-29)).map(({ role, content }) => ({
            role,
            content,
          })),
          ...(conversationId ? { conversationId } : {}),
          ...(context
            ? { context: { toolId: context.toolId, input: context.normalizedInput } }
            : {}),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error?.message || `The assistant could not start (${response.status}).`,
        );
      }
      await readEventStream(response, (event) => {
        if (event.type === 'meta') {
          setMode(event.mode ?? 'demo');
          setProvider(event.provider ?? 'mock');
          if (event.conversationId) setConversationId(event.conversationId);
          setMessages((previous) =>
            previous.map((message) =>
              message.id === replyId
                ? { ...message, mode: event.mode, provider: event.provider }
                : message,
            ),
          );
        } else if (event.type === 'delta') {
          setMessages((previous) =>
            previous.map((message) =>
              message.id === replyId
                ? { ...message, content: message.content + (event.content ?? '') }
                : message,
            ),
          );
        } else if (event.type === 'error') {
          failedEvent = true;
          setError(event.message ?? 'The response was interrupted.');
          setRetryPrompt(text);
        }
      });
      if (!failedEvent && user)
        await queryClient.invalidateQueries({ queryKey: ['conversations', user.id] });
    } catch (failure) {
      setRetryPrompt(text);
      if (controller.signal.aborted)
        setError('Response stopped. Any partial answer remains visible.');
      else
        setError(
          failure instanceof Error && failure.message !== 'Failed to fetch'
            ? failure.message
            : 'The assistant service is unavailable. Please try again shortly.',
        );
    } finally {
      setPending(false);
      controllerRef.current = null;
    }
  };
  const configuredLive = Boolean(user && status.data?.configured && status.data?.mode === 'live');
  const effectiveMode = messages.length
    ? mode === 'live'
      ? 'live'
      : 'demo'
    : configuredLive
      ? 'live'
      : 'demo';
  const panel = (
    <Card className="chat-panel">
      <div className="chat-header">
        <div className="row">
          <span className="icon-box" style={{ width: 30, height: 30 }}>
            <Sparkles size={15} />
          </span>
          <div>
            <strong style={{ fontSize: 12 }}>SubnetIQ assistant</strong>
            <div className="small muted" style={{ fontSize: 9 }}>
              {effectiveMode === 'demo'
                ? 'Demonstration · no live model request'
                : `Live · ${provider === 'mock' ? status.data?.provider : provider}`}
            </div>
          </div>
        </div>
        <div className="row">
          {compact && (
            <Link to="/assistant" className="icon-button" aria-label="Open full assistant">
              <ExternalLink size={15} />
            </Link>
          )}
          <Button
            variant="ghost"
            onClick={newConversation}
            disabled={pending}
            aria-label="New conversation"
          >
            <Plus size={16} />
            {!compact && 'New'}
          </Button>
        </div>
      </div>
      <div
        className="chat-scroll"
        ref={scrollRef}
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {!messages.length && (
          <div className="chat-welcome">
            <span className="icon-box" style={{ width: 48, height: 48 }}>
              <Bot size={24} />
            </span>
            <Badge className="badge-accent">A little context goes a long way</Badge>
            <h2>What are you working through?</h2>
            <p>
              Ask about a subnet, pressure-test an address plan, or get a concept explained from
              another angle.
            </p>
            <div className="prompt-grid">
              {prompts.slice(0, compact ? 2 : 4).map((prompt) => (
                <Button variant="secondary" key={prompt} onClick={() => void send(prompt)}>
                  {prompt}
                  <ArrowUpRight size={13} />
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <article className={`chat-message ${message.role}`} key={message.id}>
            <span className="message-icon">
              {message.role === 'user' ? <User size={15} /> : <Sparkles size={15} />}
            </span>
            <div className="message-body">
              <div className="message-label">
                <span>
                  {message.role === 'user'
                    ? 'You'
                    : `SubnetIQ${message.mode === 'demo' ? ' · demonstration' : ''}`}
                </span>
                {message.content && (
                  <div className="row">
                    <label className="switch-label">
                      <input
                        type="checkbox"
                        aria-label={`Select ${message.role} message for sharing`}
                        checked={selected.has(message.id)}
                        onChange={(event) =>
                          setSelected((prior) => {
                            const next = new Set(prior);
                            if (event.target.checked) next.add(message.id);
                            else next.delete(message.id);
                            return next;
                          })
                        }
                      />
                    </label>
                    <button
                      className="icon-button"
                      aria-label="Copy message"
                      onClick={() => void copy(message.content)}
                      style={{ padding: 3, minWidth: 22, minHeight: 22 }}
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                )}
              </div>
              {message.content ? (
                <Markdown>{message.content}</Markdown>
              ) : pending ? (
                <div className="row muted small">
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  Thinking through the question…
                </div>
              ) : (
                <p className="muted small">No answer was received.</p>
              )}
            </div>
          </article>
        ))}
      </div>
      {error && (
        <div className="error-banner" role="alert" style={{ margin: '0 18px 10px' }}>
          {error}
          {retryPrompt && !pending && (
            <div className="row" style={{ marginTop: 8 }}>
              <Button variant="secondary" onClick={() => void send(retryPrompt)}>
                <RotateCcw size={14} />
                Retry
              </Button>
              <span className="small">Sends the question again as a new turn.</span>
            </div>
          )}
        </div>
      )}
      {status.data?.mode === 'unavailable' && !messages.length && (
        <p className="small muted" style={{ padding: '0 20px 10px' }}>
          {status.data.message} You can still try the demonstration.
        </p>
      )}
      {selected.size > 0 && (
        <div className="row" style={{ padding: '0 20px 10px' }}>
          <Badge>
            <Check size={11} />
            {selected.size} selected
          </Badge>
          <Button variant="ghost" onClick={previewShare}>
            <Share2 size={13} />
            Review selected text
          </Button>
        </div>
      )}
      {!compact && messages.some((message) => message.content.trim()) && (
        <div
          className="row"
          style={{ padding: '0 20px 10px' }}
          role="group"
          aria-label="Export conversation"
        >
          <Button variant="ghost" onClick={() => exportConversation('markdown')}>
            <Download size={13} />
            Markdown
          </Button>
          <Button variant="ghost" onClick={() => exportConversation('json')}>
            <FileJson size={13} />
            JSON
          </Button>
        </div>
      )}
      <Dialog.Root open={shareOpen} onOpenChange={setShareOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <div className="dialog-header">
              <Dialog.Title>Review conversation text</Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" aria-label="Close sharing preview">
                  <X size={18} />
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="muted small">
              Only the text below will be passed to your device's sharing dialog or copied to the
              clipboard.
            </Dialog.Description>
            <Textarea
              aria-label="Selected conversation text"
              value={shareDraft}
              readOnly
              rows={10}
              style={{ margin: '16px 0', maxHeight: '50vh' }}
            />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Dialog.Close asChild>
                <Button variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button onClick={() => void share()}>
                <Share2 size={14} />
                Share text
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="chat-composer">
        {context && (
          <div className="chat-context">
            <span>
              <NetworkContext /> {context.title} attached
            </span>
            <button
              className="icon-button"
              aria-label="Remove calculation context"
              onClick={() => setContext(undefined)}
            >
              <X size={13} />
            </button>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Textarea
            aria-label="Message the assistant"
            placeholder="Ask a networking question…"
            value={input}
            maxLength={16000}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
          />
          {pending ? (
            <Button
              variant="secondary"
              onClick={() => controllerRef.current?.abort()}
              aria-label="Stop response"
            >
              <Square size={16} />
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()} aria-label="Send message">
              <Send size={17} />
            </Button>
          )}
        </form>
        <small>
          {effectiveMode === 'demo'
            ? 'Demonstration replies are generated locally by the API. '
            : 'AI responses can be inaccurate. Verify changes before using them. '}
          {user
            ? 'Completed conversations are saved to your account.'
            : 'Guest conversations last for this session.'}
        </small>
      </div>
    </Card>
  );
  if (compact) return panel;
  return (
    <div className="chat-layout">
      <aside className="chat-history">
        <Button onClick={newConversation} disabled={pending}>
          <Plus size={16} />
          New conversation
        </Button>
        <p className="eyebrow" style={{ margin: '12px 0 0' }}>
          YOUR CONVERSATIONS
        </p>
        {!user ? (
          <Card style={{ padding: 16 }}>
            <MessageCircle size={22} />
            <h3 style={{ fontSize: 13, marginTop: 10 }}>Pick up where you left off</h3>
            <p className="muted small" style={{ margin: '8px 0 12px' }}>
              Sign in to save conversations and use configured live AI.
            </p>
            <Link className="button button-secondary" to="/auth?returnTo=/assistant">
              Sign in
              <ArrowUpRight size={13} />
            </Link>
          </Card>
        ) : conversations.isLoading ? (
          <p className="muted small">Loading history…</p>
        ) : conversations.error ? (
          <p className="error-banner small">{conversations.error.message}</p>
        ) : !conversations.data?.length ? (
          <p className="muted small">Your next question starts a new conversation.</p>
        ) : (
          conversations.data.map((conversation) => (
            <div className="row" key={conversation.id} style={{ flexWrap: 'nowrap', gap: 2 }}>
              <Button
                variant={conversationId === conversation.id ? 'secondary' : 'ghost'}
                disabled={pending}
                style={{ flex: 1, fontSize: 11 }}
                onClick={() => void loadConversation(conversation.id)}
              >
                <MessageCircle size={13} />
                <span>{conversation.title}</span>
              </Button>
              <ConfirmDialog
                trigger={
                  <button
                    className="icon-button"
                    aria-label={`Delete conversation ${conversation.title}`}
                    disabled={pending}
                  >
                    <Trash2 size={12} />
                  </button>
                }
                title="Delete this conversation?"
                description="The saved messages in this conversation will be permanently removed."
                confirmLabel="Delete conversation"
                onConfirm={async () => {
                  await api(`/ai/conversations/${conversation.id}`, { method: 'DELETE' });
                  if (conversationId === conversation.id) newConversation();
                  await conversations.refetch();
                }}
              />
            </div>
          ))
        )}
        <Card style={{ padding: 14, marginTop: 'auto' }}>
          <p className="small muted">
            Use the calculator’s “Discuss this result” action to attach exact inputs. The API checks
            the math before sending context to a model.
          </p>
          {status.error && (
            <p className="small muted" style={{ marginTop: 8 }}>
              Assistant service status is currently unavailable.
            </p>
          )}
          {status.data?.dailyLimit && (
            <p className="small muted" style={{ marginTop: 8 }}>
              Live allowance: {status.data.dailyLimit} requests per day.
            </p>
          )}
        </Card>
      </aside>
      {panel}
    </div>
  );
}
function NetworkContext() {
  return <Sparkles size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />;
}

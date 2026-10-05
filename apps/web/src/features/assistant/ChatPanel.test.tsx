import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query';
import { downloadFile } from '@/lib/export';
import { ChatPanel } from './ChatPanel';

vi.mock('@/lib/api', () => ({
  api: vi.fn(),
  apiHeaders: async () => new Headers({ 'Content-Type': 'application/json' }),
  apiUrl: (path: string) => `/api${path}`,
}));
vi.mock('@/lib/auth', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/export', () => ({ downloadFile: vi.fn() }));

function demoResponse() {
  return new Response(
    'data: {"type":"meta","mode":"demo","provider":"mock"}\n\ndata: {"type":"delta","content":"A /24 has 256 addresses. Demonstration."}\n\ndata: {"type":"done"}\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

function openPanel() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChatPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    session: null,
    configured: false,
    loading: false,
    signOut: vi.fn(),
  });
  vi.mocked(api).mockResolvedValue({
    configured: false,
    provider: 'mock',
    mode: 'demo',
    dailyLimit: 30,
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(demoResponse()));
});

describe('assistant user workflows', () => {
  it('never labels an unsupported configured provider as live', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'owner' } as never,
      session: null,
      configured: true,
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(api).mockImplementation(
      async (path) =>
        (path === '/ai/status'
          ? {
              configured: false,
              provider: 'Anthropic',
              mode: 'unavailable',
              message: 'Anthropic integration is not implemented.',
            }
          : []) as never,
    );
    openPanel();
    expect(await screen.findByText(/Anthropic integration is not implemented/)).toBeInTheDocument();
    expect(screen.getByText('Demonstration · no live model request')).toBeInTheDocument();
    expect(screen.queryByText(/Live · Anthropic/)).not.toBeInTheDocument();
  });

  it('retries a failed question as an explicit new turn without empty message payloads', async () => {
    const user = userEvent.setup();
    const fetcher = vi.mocked(fetch);
    fetcher
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Temporary failure.' } }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(demoResponse());
    openPanel();
    await user.type(screen.getByRole('textbox', { name: 'Message the assistant' }), 'Explain /24');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Temporary failure.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('A /24 has 256 addresses. Demonstration.')).toBeInTheDocument();
    const body = JSON.parse(fetcher.mock.calls[1][1]!.body as string);
    expect(body.messages).toHaveLength(2);
    expect(body.messages.every((message: { content: string }) => message.content.trim())).toBe(
      true,
    );
    expect(
      body.messages.filter((message: { role: string }) => message.role === 'user'),
    ).toHaveLength(2);
  });

  it('previews selected text before invoking native sharing', async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    openPanel();
    await user.type(
      screen.getByRole('textbox', { name: 'Message the assistant' }),
      'My subnet question',
    );
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByText('A /24 has 256 addresses. Demonstration.');
    await user.click(screen.getByRole('checkbox', { name: 'Select user message for sharing' }));
    await user.click(screen.getByRole('button', { name: 'Review selected text' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Selected conversation text' })).toHaveValue(
      'You\n\nMy subnet question',
    );
    expect(share).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Share text' }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: 'Selected SubnetIQ conversation messages',
        text: 'You\n\nMy subnet question',
      }),
    );
  });

  it('exports visible conversation content without account credentials', async () => {
    const user = userEvent.setup();
    openPanel();
    await user.type(
      screen.getByRole('textbox', { name: 'Message the assistant' }),
      'Export this question',
    );
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByText('A /24 has 256 addresses. Demonstration.');
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    const call = vi.mocked(downloadFile).mock.calls[0];
    expect(call[0]).toBe('subnetiq-conversation-session.json');
    const exported = JSON.parse(call[1] as string);
    expect(exported.messages).toHaveLength(2);
    expect(exported.messages[1].mode).toBe('demo');
    expect(exported).not.toHaveProperty('session');
    expect(exported).not.toHaveProperty('access_token');
    await user.click(screen.getByRole('button', { name: 'Markdown' }));
    expect(vi.mocked(downloadFile).mock.calls[1][0]).toBe('subnetiq-conversation-session.md');
  });
});

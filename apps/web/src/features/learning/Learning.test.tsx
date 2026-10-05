import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { generatePracticeQuestion } from '@subnetiq/shared';
import { BinaryOctet } from './LessonPage';
import GlossaryPage from './GlossaryPage';
import PracticePage from './PracticePage';
import { api } from '@/lib/api';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: null, configured: false, loading: false }),
}));
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
vi.mock('@/components/ResultPanel', () => ({
  default: ({
    result,
  }: {
    result: { title: string; summary: { label: string; value: string }[] };
  }) => (
    <section>
      <h2>{result.title}</h2>
      {result.summary.map((item) => (
        <p key={item.label}>
          {item.label}: {item.value}
        </p>
      ))}
    </section>
  ),
}));

function mount(component: React.ReactNode, route = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{component}</MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('interactive learning surfaces', () => {
  it('toggles bit weights accessibly and handles all-zero and all-one octets', () => {
    mount(<BinaryOctet />);
    expect(screen.getByRole('button', { name: 'Toggle weight 128' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle weight 128' }));
    expect(screen.getByText('01000000')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByText('00000000')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set all' }));
    expect(screen.getByText('11111111')).toBeInTheDocument();
  });
  it('finds a glossary concept and follows a resolvable related link', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    mount(<GlossaryPage />, '/glossary');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search glossary' }), {
      target: { value: 'longest-prefix match' },
    });
    const term = within(screen.getByRole('heading', { name: 'Longest-prefix match' })).getByRole(
      'button',
    );
    fireEvent.click(term);
    expect(screen.getByText('One connected concept')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Routing table' }));
    expect(screen.getByRole('heading', { name: 'Routing table' })).toBeInTheDocument();
    expect(screen.getByText(/A set of destination prefixes/)).toBeInTheDocument();
  });
  it('updates glossary search when a query link changes the URL without remounting', () => {
    mount(
      <>
        <Link to="/glossary?q=CIDR">Search for CIDR</Link>
        <GlossaryPage />
      </>,
      '/glossary?q=longest-prefix',
    );
    expect(screen.getByRole('textbox', { name: 'Search glossary' })).toHaveValue('longest-prefix');
    expect(screen.getByRole('heading', { name: 'Longest-prefix match' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Search for CIDR' }));
    expect(screen.getByRole('textbox', { name: 'Search glossary' })).toHaveValue('CIDR');
    expect(screen.getByRole('heading', { name: 'CIDR' })).toBeInTheDocument();
  });
  it('locks an answer, explains correctness, advances, and keeps guest answers local', () => {
    mount(<PracticePage />, '/practice');
    fireEvent.change(screen.getByLabelText('Question source'), { target: { value: 'generated' } });
    fireEvent.change(screen.getByLabelText('Questions'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Reproducible session seed'));
    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: /Start practice/ }));
    const first = generatePracticeQuestion(42, 'beginner', 0);
    expect(screen.getByRole('heading', { name: first.question })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check answer/ })).toBeDisabled();
    fireEvent.click(screen.getAllByRole('radio')[first.correctIndex]!);
    fireEvent.click(screen.getByRole('button', { name: /Check answer/ }));
    expect(screen.getByText(first.explanation)).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('radio')
        .every(
          (radio) => (radio as HTMLInputElement).disabled || radio.closest('fieldset')?.disabled,
        ),
    ).toBe(true);
    expect(screen.getByText('Correct. Keep the reasoning.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next question/ }));
    expect(
      screen.getByRole('heading', { name: generatePracticeQuestion(42, 'beginner', 1).question }),
    ).toBeInTheDocument();
    expect(vi.mocked(api)).not.toHaveBeenCalled();
  });
  it('ends a timed session without inventing submitted answers', () => {
    vi.useFakeTimers();
    mount(<PracticePage />, '/practice');
    fireEvent.change(screen.getByLabelText('Questions'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start practice/ }));
    act(() => {
      vi.advanceTimersByTime(450001);
    });
    expect(screen.getByRole('heading', { name: 'Practice time complete' })).toBeInTheDocument();
    expect(screen.getByText('Score: 0 / 5')).toBeInTheDocument();
    expect(vi.mocked(api)).not.toHaveBeenCalled();
  });
  it('explains that saved history requires an account', () => {
    mount(<PracticePage />, '/practice');
    fireEvent.click(screen.getByRole('button', { name: /Saved history/ }));
    expect(
      screen.getByRole('heading', { name: 'Keep a history of your progress' }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('heading', { name: 'Keep a history of your progress' }).parentElement!,
      ).getByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/auth');
    expect(vi.mocked(api)).not.toHaveBeenCalled();
  });
});

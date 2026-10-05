import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FavoriteButton } from './FavoriteButton';
import { queryClient } from '@/lib/query';
const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  api: vi.fn(),
  notify: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/lib/api', () => ({ api: state.api }));
vi.mock('@/lib/notify', () => ({ notify: state.notify }));
beforeEach(() => {
  queryClient.clear();
  state.user = null;
  state.api.mockReset();
  state.notify.mockReset();
});
function open() {
  return render(
    <MemoryRouter initialEntries={['/tools/ipv4-subnet']}>
      <Routes>
        <Route
          path="/tools/ipv4-subnet"
          element={
            <FavoriteButton
              toolId="ipv4-subnet"
              label="IPv4 calculator"
              signInPath="/auth?returnTo=%2Ftools%2Fipv4-subnet"
            />
          }
        />
        <Route path="/auth" element={<h1>Sign in to your workspace</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}
describe('favorite controls', () => {
  it('sends a guest to sign-in without pretending to persist a favorite', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Add IPv4 calculator to favorites' }));
    expect(screen.getByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument();
    expect(state.api).not.toHaveBeenCalled();
  });
  it('loads, creates, and removes the current owner favorite through the API', async () => {
    state.user = { id: 'owner' };
    state.api.mockImplementation(async (path, options) =>
      !options
        ? []
        : options.method === 'POST'
          ? { id: 'fav-1', tool_id: 'ipv4-subnet', label: 'IPv4 calculator' }
          : undefined,
    );
    open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add IPv4 calculator to favorites' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add IPv4 calculator to favorites' }));
    await screen.findByRole('button', { name: 'Remove IPv4 calculator from favorites' });
    expect(state.api).toHaveBeenCalledWith('/favorites', {
      method: 'POST',
      body: JSON.stringify({ tool_id: 'ipv4-subnet', label: 'IPv4 calculator' }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove IPv4 calculator from favorites' }));
    await screen.findByRole('button', { name: 'Add IPv4 calculator to favorites' });
    expect(state.api).toHaveBeenCalledWith('/favorites/fav-1', { method: 'DELETE' });
  });
  it('keeps the prior state when persistence fails', async () => {
    state.user = { id: 'owner' };
    state.api.mockImplementation(async (_path, options) => {
      if (!options) return [];
      throw new Error('Service unavailable');
    });
    open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add IPv4 calculator to favorites' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add IPv4 calculator to favorites' }));
    await waitFor(() => expect(state.notify).toHaveBeenCalledWith('Service unavailable', 'error'));
    expect(
      screen.getByRole('button', { name: 'Add IPv4 calculator to favorites' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});

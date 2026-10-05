import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from '@/lib/api';
import ToolkitPage from './ToolkitPage';
import NetworkTemplatesPage from './NetworkTemplatesPage';
import { toolkitResult } from './results';

vi.mock('@/lib/api', () => ({ api: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: null, configured: false, loading: false }),
}));

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/toolkit" element={<ToolkitPage />} />
        <Route path="/toolkit/:section" element={<ToolkitPage />} />
        <Route path="/templates" element={<NetworkTemplatesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('toolkit user workflows', () => {
  it('filters reference rows through the accessible search control', async () => {
    const user = userEvent.setup();
    open('/toolkit/ports');
    await user.type(screen.getByRole('textbox', { name: 'Search ports and protocols' }), '22 ssh');
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByText('22')).toBeInTheDocument();
    expect(within(rows[1]).getByText('SSH')).toBeInTheDocument();
  });
  it('generates a Cisco ACL through the form and provides a result export surface', async () => {
    const user = userEvent.setup();
    open('/toolkit/firewall');
    await user.selectOptions(screen.getByLabelText('Platform'), 'cisco');
    await user.click(screen.getByRole('button', { name: 'Generate rule' }));
    const region = screen.getByRole('region', { name: 'Calculation result' });
    expect(region).toHaveTextContent('permit tcp 192.168.10.0 0.0.0.255 any eq 443');
    expect(within(region).getByRole('button', { name: 'JSON' })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'PDF' })).toBeInTheDocument();
  });
  it('submits the selected DNS record type and renders a real response contract', async () => {
    const user = userEvent.setup();
    vi.mocked(api).mockResolvedValueOnce(
      toolkitResult(
        'dns',
        'DNS answer',
        { name: '8.8.8.8', type: 'PTR' },
        [{ label: 'Value', value: 'dns.google.' }],
        { sources: ['https://www.rfc-editor.org/rfc/rfc1035.html'] },
      ),
    );
    open('/toolkit/dns');
    await user.selectOptions(screen.getByLabelText('Record type'), 'PTR');
    const query = screen.getByLabelText('IP address or reverse name');
    await user.clear(query);
    await user.type(query, '8.8.8.8');
    await user.click(screen.getByRole('button', { name: 'Look up records' }));
    expect(await screen.findByText('dns.google.')).toBeInTheDocument();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      '/lookups/dns',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: '8.8.8.8', type: 'PTR' }),
      }),
    );
  });
  it('displays lookup failure without fabricated answer rows', async () => {
    const user = userEvent.setup();
    vi.mocked(api).mockRejectedValueOnce(
      new Error('Registration service unavailable. Try again later.'),
    );
    open('/toolkit/ip-info');
    await user.click(screen.getByRole('button', { name: 'Look up registration' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Registration service unavailable');
    expect(screen.queryByRole('region', { name: 'Calculation result' })).not.toBeInTheDocument();
  });
  it('keeps password source outside both the result and the print surface', async () => {
    const user = userEvent.setup();
    open('/toolkit/passwords');
    const input = screen.getByLabelText('Password to assess', { selector: 'input' });
    expect(input).toHaveAttribute('type', 'password');
    await user.type(input, 'SecretInput_NotForExports938');
    await user.click(screen.getByRole('button', { name: 'Assess strength' }));
    const result = await screen.findByRole('region', { name: 'Calculation result' });
    expect(result).not.toHaveTextContent('SecretInput_NotForExports938');
    expect(input.closest('.card')).toHaveClass('no-print');
    await user.click(screen.getByRole('button', { name: 'Clear input & result' }));
    expect(input).toHaveValue('');
    expect(screen.queryByRole('region', { name: 'Calculation result' })).not.toBeInTheDocument();
  });
  it('opens a complete template without requiring account configuration', async () => {
    open('/templates?template=smb');
    const link = screen.getByRole('link', { name: 'Open in VLSM planner' });
    const address = new URL(link.getAttribute('href')!, 'https://example.com');
    const input = JSON.parse(address.searchParams.get('input')!);
    expect(address.pathname).toBe('/tools/vlsm');
    expect(input.network).toBe('10.20.0.0/22');
    expect(input.segments).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Sign in to save a project' })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Calculation result' })).toHaveTextContent(
      '10.20.1.192/26',
    );
  });
});

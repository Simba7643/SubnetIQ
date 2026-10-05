import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ToolPage from './ToolPage';
import ToolsPage from './ToolsPage';
import { toolDefinitions } from './toolDefinitions';
import { queryClient } from '@/lib/query';

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  api: vi.fn(),
  notify: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: state.user, configured: true, loading: false }),
}));
vi.mock('@/lib/api', () => ({ api: state.api }));
vi.mock('@/lib/notify', () => ({ notify: state.notify }));

function ProjectHandoff() {
  const location = useLocation();
  return <pre data-testid="project-handoff">{JSON.stringify(location.state)}</pre>;
}

function openTool(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/tools/:toolId" element={<ToolPage />} />
        <Route path="/projects" element={<ProjectHandoff />} />
        <Route path="/auth" element={<h1>Sign in</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function resultValue(label: string) {
  const panel = screen.getByRole('region', { name: 'Calculation result' });
  const term = within(panel).getByText(label, { selector: 'dt' });
  return term.parentElement?.querySelector('dd');
}

beforeEach(() => {
  queryClient.clear();
  state.user = null;
  state.api.mockReset().mockResolvedValue({ id: 'saved-calculation' });
  state.notify.mockReset();
});

describe('calculator collection', () => {
  it('finds a tool by a protocol alias and narrows by category', async () => {
    const user = userEvent.setup();
    openTool('/tools');
    await user.type(screen.getByRole('searchbox', { name: 'Search tools' }), 'nat64');
    expect(screen.getByRole('link', { name: /IPv4 \/ IPv6 mapping/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /VLSM planner/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear tool search' }));
    await user.click(screen.getByRole('button', { name: /^Planning/ }));
    expect(screen.getByRole('link', { name: /VLSM planner/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /MAC address inspector/ })).not.toBeInTheDocument();
  });

  it.each(toolDefinitions)(
    'opens $id with usable inputs, an exact result, and result controls',
    (tool) => {
      openTool(`/tools/${tool.id}`);
      expect(screen.getByRole('heading', { level: 1, name: tool.title })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Calculation result' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Calculate' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'JSON' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Add to a project' })).toBeInTheDocument();
    },
  );

  it('handles an unknown tool without rendering a broken calculator', () => {
    openTool('/tools/not-a-tool');
    expect(
      screen.getByRole('heading', { name: 'This tool could not be found.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse all tools' })).toHaveAttribute(
      'href',
      '/tools',
    );
  });
});

describe('interactive calculations', () => {
  it('recalculates the address when a network bit is toggled', async () => {
    const user = userEvent.setup();
    openTool('/tools/ipv4-subnet');
    expect(resultValue('Network')).toHaveTextContent('192.168.10.0/24');
    await user.click(screen.getByRole('button', { name: 'Show visual lab' }));
    await user.click(
      screen.getByRole('button', { name: 'Octet 1, bit 1, weight 128, network bit' }),
    );
    expect(screen.getByRole('textbox', { name: 'IPv4 address / prefix' })).toHaveValue(
      '64.168.10.42/24',
    );
    await waitFor(() => expect(resultValue('Network')).toHaveTextContent('64.168.10.0/24'));
    fireEvent.change(screen.getByRole('slider', { name: 'IPv4 prefix length' }), {
      target: { value: '31' },
    });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Address capacity policy' }),
      'point-to-point',
    );
    await waitFor(() => expect(resultValue('Usable under policy')).toHaveTextContent(/^2$/));
    expect(resultValue('Broadcast')).toHaveTextContent('Not applicable');
  });

  it('clears the result while invalid input is being corrected', async () => {
    openTool('/tools/ipv4-subnet');
    fireEvent.change(screen.getByRole('textbox', { name: 'IPv4 address / prefix' }), {
      target: { value: '999.1.1.1/24' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Calculation result' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/Enter four IPv4 octets from 0 to 255/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'IPv4 address / prefix' }), {
      target: { value: '10.1.2.3/24' },
    });
    await waitFor(() => expect(resultValue('Network')).toHaveTextContent('10.1.2.0/24'));
  });

  it('calculates borrowed bits from a supplied parent and navigates adjacent subnets', async () => {
    const user = userEvent.setup();
    openTool('/tools/ipv4-subnet');
    fireEvent.change(screen.getByRole('textbox', { name: 'Parent network (optional)' }), {
      target: { value: '192.168.0.0/16' },
    });
    await waitFor(() => expect(resultValue('Borrowed bits')).toHaveTextContent(/^8$/));
    await user.click(screen.getByRole('button', { name: 'Next IPv4 subnet' }));
    await waitFor(() => expect(resultValue('Network')).toHaveTextContent('192.168.11.0/24'));
  });

  it('applies a provider variant and resets it when changing policy', async () => {
    const user = userEvent.setup();
    openTool('/tools/ipv4-subnet');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Address capacity policy' }),
      'aws',
    );
    await waitFor(() => expect(resultValue('Usable under policy')).toHaveTextContent(/^251$/));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Provider allocation variant' }),
      'byoip',
    );
    await waitFor(() => expect(resultValue('Usable under policy')).toHaveTextContent(/^256$/));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Address capacity policy' }),
      'lan',
    );
    await waitFor(() => expect(resultValue('Usable under policy')).toHaveTextContent(/^254$/));
    expect(
      screen.queryByRole('combobox', { name: 'Provider allocation variant' }),
    ).not.toBeInTheDocument();
  });

  it('keeps locked VLSM blocks fixed, merges reservations visually, and explains an impossible request', async () => {
    const user = userEvent.setup();
    const input = {
      network: '10.0.0.0/24',
      policy: 'lan',
      segments: [
        { name: 'Core', hosts: 50, lockedCidr: '10.0.0.0/26' },
        { name: 'Users', hosts: 40, growthPercent: 25 },
      ],
      reserved: ['10.0.0.192/27', '10.0.0.224/27'],
    };
    openTool(`/tools/vlsm?input=${encodeURIComponent(JSON.stringify(input))}`);
    expect(
      screen.getByRole('button', { name: 'Reserved 1, 10.0.0.192/26, 64 addresses, reserved' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Reserved, 10.0.0.192\/27/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Segment 1 hosts' }), {
      target: { value: '100' },
    });
    await waitFor(() =>
      expect(screen.getByText(/locked CIDR 10.0.0.0\/26 holds 62 hosts/)).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Segment 1 hosts' }), {
      target: { value: '50' },
    });
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Calculation result' })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Add segment' }));
    expect(screen.getByRole('textbox', { name: 'Segment 3 name' })).toHaveValue('Segment 3');
    await user.click(screen.getByRole('button', { name: 'Remove segment 3' }));
    expect(screen.queryByRole('textbox', { name: 'Segment 3 name' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Segment 1 locked CIDR' })).toHaveValue(
      '10.0.0.0/26',
    );
  });

  it('pages through IPv6 child networks while preserving the full allocation total', async () => {
    const user = userEvent.setup();
    openTool('/tools/ipv6-plan');
    expect(resultValue('Total subnet positions')).toHaveTextContent('65536');
    const navigation = screen.getByRole('group', { name: 'IPv6 allocation preview navigation' });
    await user.click(within(navigation).getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('textbox', { name: 'First child index' })).toHaveValue('16');
    await waitFor(() => expect(resultValue('Preview window')).toHaveTextContent('16–31'));
    expect(resultValue('Total subnet positions')).toHaveTextContent('65536');
    await user.click(within(navigation).getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole('textbox', { name: 'First child index' })).toHaveValue('0');
  });

  it('distinguishes a partial IPv6 reservation from an unavailable child prefix', async () => {
    openTool('/tools/ipv6-plan');
    fireEvent.change(screen.getByRole('textbox', { name: 'Reserved IPv6 prefixes (optional)' }), {
      target: { value: '2001:db8:1200::/80' },
    });
    await waitFor(() =>
      expect(resultValue('Unavailable child positions')).toHaveTextContent(/^1$/),
    );
    expect(resultValue('Available child positions')).toHaveTextContent('65535');
    expect(resultValue('Physically reserved addresses')).toHaveTextContent('281474976710656');
    expect(
      screen.getByRole('button', { name: /Subnet 1.*unavailable: overlaps a reservation/ }),
    ).toBeInTheDocument();
  });

  it('preserves an embedded address when switching from encoding to decoding', async () => {
    const user = userEvent.setup();
    openTool('/tools/ipv4-map');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Conversion direction' }),
      'decode',
    );
    expect(screen.getByRole('textbox', { name: 'IPv6 mapping address' })).toHaveValue(
      '::ffff:192.0.2.33',
    );
    await waitFor(() => expect(resultValue('IPv4 address')).toHaveTextContent('192.0.2.33'));
    expect(resultValue('Direction')).toHaveTextContent('Extract embedded IPv4');
  });

  it('distinguishes the base MSS ceiling from the data budget with TCP options', async () => {
    openTool('/tools/mtu');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'TCP options & padding (bytes)' }), {
      target: { value: '12' },
    });
    await waitFor(() =>
      expect(resultValue('TCP data per packet with chosen headers')).toHaveTextContent(
        '1448 bytes',
      ),
    );
    expect(resultValue('Base MSS ceiling')).toHaveTextContent('1460 bytes');
  });
});

describe('calculation handoffs', () => {
  it('saves the current canonical input through the authenticated API', async () => {
    state.user = { id: 'user-1' };
    const user = userEvent.setup();
    openTool('/tools/ipv4-subnet');
    fireEvent.change(screen.getByRole('textbox', { name: 'IPv4 address / prefix' }), {
      target: { value: '10.9.8.7/20' },
    });
    await waitFor(() => expect(resultValue('Network')).toHaveTextContent('10.9.0.0/20'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(state.api.mock.calls.some(([path]) => path === '/saved-calculations')).toBe(true),
    );
    const [path, options] = state.api.mock.calls.find(([path]) => path === '/saved-calculations')!;
    expect(path).toBe('/saved-calculations');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body).input).toMatchObject({ address: '10.9.8.7/20', policy: 'lan' });
    expect(state.notify).toHaveBeenCalledWith('Calculation saved to your account.');
  });

  it('reports a persistence error without claiming the calculation was saved', async () => {
    state.user = { id: 'user-1' };
    state.api.mockRejectedValue(new Error('The database connection is unavailable.'));
    const user = userEvent.setup();
    openTool('/tools/ipv4-subnet');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(state.notify).toHaveBeenCalledWith('The database connection is unavailable.', 'error'),
    );
    expect(state.notify).not.toHaveBeenCalledWith('Calculation saved to your account.');
  });

  it('passes the current result into a project without storing guest history', async () => {
    const user = userEvent.setup();
    openTool('/tools/ipv4-subnet');
    fireEvent.change(screen.getByRole('textbox', { name: 'IPv4 address / prefix' }), {
      target: { value: '172.16.32.1/21' },
    });
    await waitFor(() => expect(resultValue('Network')).toHaveTextContent('172.16.32.0/21'));
    await user.click(screen.getByRole('link', { name: 'Add to a project' }));
    const handoff = JSON.parse(screen.getByTestId('project-handoff').textContent ?? '{}');
    expect(handoff.calculation.normalizedInput.address).toBe('172.16.32.1/21');
    expect(state.api).not.toHaveBeenCalled();
  });
});

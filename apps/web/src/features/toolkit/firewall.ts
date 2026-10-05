import { formatIPv4, parseNetwork, prefixMask } from '@subnetiq/netcalc';
import { toolkitResult } from './results';

export interface FirewallInput {
  platform: 'iptables' | 'ufw' | 'cisco' | 'pfsense';
  family: 4 | 6;
  action: 'allow' | 'deny' | 'reject';
  direction: 'in' | 'out' | 'forward';
  protocol: 'tcp' | 'udp' | 'icmp' | 'any';
  source: string;
  destination: string;
  port: string;
  interface: string;
}

export const firewallDefaults: FirewallInput = {
  platform: 'iptables',
  family: 4,
  action: 'allow',
  direction: 'in',
  protocol: 'tcp',
  source: '192.168.10.0/24',
  destination: 'any',
  port: '443',
  interface: 'LAN',
};

function parsePort(
  value: string,
): { start: number; end: number; colon: string; display: string } | null {
  if (!value.trim()) return null;
  const match = /^(\d{1,5})(?:[-:](\d{1,5}))?$/.exec(value.trim());
  if (!match)
    throw new Error(
      'Use one destination port, such as 443, or an inclusive range, such as 8000-8080.',
    );
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (start < 1 || end > 65535 || end < start)
    throw new Error('Destination ports must run from 1 through 65535, with the lower port first.');
  return {
    start,
    end,
    colon: start === end ? String(start) : start + ':' + end,
    display: start === end ? String(start) : start + '-' + end,
  };
}

function endpoint(value: string, family: 4 | 6) {
  const text = value.trim();
  if (!text || text.toLowerCase() === 'any')
    return { any: true, cidr: family === 4 ? '0.0.0.0/0' : '::/0', cisco: 'any', prefix: 0 };
  if (text.length > 80 || !/^[0-9A-Fa-f:./]+$/.test(text))
    throw new Error(
      'Use a literal IP address, CIDR, or any. Hostnames and command text are not accepted.',
    );
  const network = parseNetwork(
    text.includes('/') ? text : text + '/' + (family === 4 ? 32 : 128),
    family,
  );
  if (network.family !== family)
    throw new Error('Source and destination must match the selected IP version.');
  if (network.prefix === 0) return { any: true, cidr: network.cidr, cisco: 'any', prefix: 0 };
  const host = network.prefix === (family === 4 ? 32 : 128);
  const cisco =
    family === 6
      ? network.cidr
      : host
        ? 'host ' + formatIPv4(network.start)
        : formatIPv4(network.start) +
          ' ' +
          formatIPv4(((1n << 32n) - 1n) ^ prefixMask(network.prefix, 32));
  return { any: false, cidr: network.cidr, cisco, prefix: network.prefix };
}

export function generateFirewall(input: FirewallInput) {
  if (!['iptables', 'ufw', 'cisco', 'pfsense'].includes(input.platform))
    throw new Error('Choose a supported firewall platform.');
  if (![4, 6].includes(input.family)) throw new Error('Choose IPv4 or IPv6.');
  if (
    !['allow', 'deny', 'reject'].includes(input.action) ||
    !['in', 'out', 'forward'].includes(input.direction) ||
    !['tcp', 'udp', 'icmp', 'any'].includes(input.protocol)
  )
    throw new Error('Choose a valid action, direction, and protocol.');
  const source = endpoint(input.source, input.family);
  const destination = endpoint(input.destination, input.family);
  const port = parsePort(input.port);
  if (port && !['tcp', 'udp'].includes(input.protocol))
    throw new Error(
      'A destination port applies to TCP or UDP. Clear the port for ICMP or any protocol.',
    );
  if (input.platform === 'ufw' && input.protocol === 'icmp')
    throw new Error(
      'UFW does not provide this simple ICMP rule syntax. Use iptables or a reviewed UFW before.rules configuration.',
    );
  if (input.platform === 'cisco' && input.action === 'reject')
    throw new Error(
      'A Cisco extended ACL can permit or deny. Choose deny for silent packet drops.',
    );
  if (input.platform === 'pfsense' && !/^[A-Za-z0-9 _.-]{1,32}$/.test(input.interface))
    throw new Error(
      'Use a 1–32 character pfSense interface label with letters, numbers, spaces, dots, underscores, or hyphens.',
    );
  const warnings: string[] = [];
  let configuration: string;
  let check = '';
  let remove = '';
  let sourceUrl: string;
  const protocol = input.protocol === 'icmp' && input.family === 6 ? 'ipv6-icmp' : input.protocol;
  if (input.platform === 'iptables') {
    const binary = input.family === 6 ? 'ip6tables' : 'iptables';
    const chain = { in: 'INPUT', out: 'OUTPUT', forward: 'FORWARD' }[input.direction];
    const target = { allow: 'ACCEPT', deny: 'DROP', reject: 'REJECT' }[input.action];
    const spec = [
      chain,
      input.protocol === 'any' ? '' : '-p ' + protocol,
      source.any ? '' : '-s ' + source.cidr,
      destination.any ? '' : '-d ' + destination.cidr,
      port ? '--dport ' + port.colon : '',
      '-j ' + target,
    ]
      .filter(Boolean)
      .join(' ');
    configuration = binary + ' -A ' + spec;
    check = binary + ' -C ' + spec;
    remove = binary + ' -D ' + spec;
    warnings.push(
      'This appends a rule to the selected chain. Existing rule order, connection tracking, default policy, and persistence remain part of the complete firewall configuration.',
    );
    sourceUrl = 'https://ipset.netfilter.org/iptables.man.html';
  } else if (input.platform === 'ufw') {
    const route = input.direction === 'forward' ? 'route ' : '';
    const direction = input.direction === 'forward' ? '' : input.direction + ' ';
    const parts = [
      'ufw ' + route + input.action + ' ' + direction,
      'from ' + source.cidr,
      'to ' + destination.cidr,
      port ? 'port ' + port.colon : '',
      input.protocol === 'any' ? '' : 'proto ' + input.protocol,
    ];
    configuration = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    remove = configuration.replace(/^ufw /, 'ufw delete ');
    check = 'ufw status numbered';
    warnings.push(
      'Verify UFW IPv6 support and existing rule order. The status command shows active rules; this helper does not enable or change the default firewall policy.',
    );
    sourceUrl = 'https://manpages.ubuntu.com/manpages/noble/en/man8/ufw.8.html';
  } else if (input.platform === 'cisco') {
    const mode = input.family === 6 ? 'ipv6 access-list' : 'ip access-list extended';
    const action = input.action === 'allow' ? 'permit' : 'deny';
    const ipProtocol =
      input.protocol === 'any' ? (input.family === 6 ? 'ipv6' : 'ip') : input.protocol;
    const portClause = port
      ? port.start === port.end
        ? ' eq ' + port.start
        : ' range ' + port.start + ' ' + port.end
      : '';
    configuration =
      mode +
      ' SUBNETIQ\n ' +
      action +
      ' ' +
      ipProtocol +
      ' ' +
      source.cisco +
      ' ' +
      destination.cisco +
      portClause;
    check = input.family === 6 ? 'show ipv6 access-list SUBNETIQ' : 'show ip access-lists SUBNETIQ';
    warnings.push(
      'Bind the ACL to the intended interface and direction only after reviewing the full policy. Implicit deny behavior and earlier entries affect traffic; this helper does not generate the rest of that policy.',
    );
    sourceUrl =
      'https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html';
  } else {
    if (input.direction !== 'in')
      throw new Error(
        'This pfSense worksheet targets an incoming interface rule. Select incoming, or use floating-rule documentation for other directions.',
      );
    const action = { allow: 'Pass', deny: 'Block', reject: 'Reject' }[input.action];
    configuration = [
      'Rule type: Interface rule worksheet',
      'Interface: ' + input.interface.trim(),
      'Action: ' + action,
      'Address family: IPv' + input.family,
      'Protocol: ' + (input.protocol === 'any' ? 'Any' : input.protocol.toUpperCase()),
      'Source: ' + (source.any ? 'Any' : source.cidr),
      'Source port: Any',
      'Destination: ' + (destination.any ? 'Any' : destination.cidr),
      'Destination port: ' + (port?.display ?? 'Any'),
      'Description: Reviewed SubnetIQ rule',
    ].join('\n');
    warnings.push(
      'This is a worksheet for the pfSense interface, not an importable configuration. Interface rules apply to traffic entering that interface; floating rules and NAT can change the complete evaluation.',
    );
    sourceUrl = 'https://docs.netgate.com/pfsense/en/latest/firewall/configure.html';
  }
  return toolkitResult(
    'firewall',
    input.platform === 'pfsense' ? 'pfSense rule worksheet' : 'Firewall rule helper',
    { ...input, source: source.cidr, destination: destination.cidr, port: port?.display ?? '' },
    [
      { label: 'Platform', value: input.platform },
      { label: 'Address family', value: 'IPv' + input.family },
      { label: 'Action', value: input.action },
      { label: 'Configuration', value: configuration },
      ...(check ? [{ label: 'Inspect / verify', value: check }] : []),
      ...(remove ? [{ label: 'Remove this rule', value: remove }] : []),
    ],
    {
      warnings,
      data: { configuration, check, remove },
      sources: [sourceUrl],
      steps: [
        {
          title: 'Normalize the address match',
          description:
            'Source and destination are validated as literal IPv' +
            input.family +
            ' networks. Host bits in a CIDR are normalized to the network boundary.',
        },
        {
          title: 'Constrain the service',
          description: port
            ? 'The rule matches destination port ' +
              port.display +
              ' over ' +
              input.protocol.toUpperCase() +
              '. Source ports are unrestricted.'
            : 'No destination-port constraint is included.',
        },
        {
          title: 'Review the surrounding policy',
          description:
            'The generated text has not been applied to a device. Compare it with current rules, intended direction, and rollback access before making a configuration change.',
        },
      ],
    },
  );
}

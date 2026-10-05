import { toolkitResult } from './results';

interface Metric {
  name: string;
  group: string;
  values: Record<string, string>;
}
const impact = { H: 'High', L: 'Low', N: 'None' };
const defined = { X: 'Not defined' };
const requirements = { X: 'Not defined', H: 'High', M: 'Medium', L: 'Low' };
const base: Record<string, Metric> = {
  AV: {
    name: 'Attack vector',
    group: 'Base',
    values: { N: 'Network', A: 'Adjacent', L: 'Local', P: 'Physical' },
  },
  AC: { name: 'Attack complexity', group: 'Base', values: { L: 'Low', H: 'High' } },
  AT: { name: 'Attack requirements', group: 'Base', values: { N: 'None', P: 'Present' } },
  PR: { name: 'Privileges required', group: 'Base', values: { N: 'None', L: 'Low', H: 'High' } },
  UI: { name: 'User interaction', group: 'Base', values: { N: 'None', P: 'Passive', A: 'Active' } },
  VC: { name: 'Vulnerable system confidentiality', group: 'Base', values: impact },
  VI: { name: 'Vulnerable system integrity', group: 'Base', values: impact },
  VA: { name: 'Vulnerable system availability', group: 'Base', values: impact },
  SC: { name: 'Subsequent system confidentiality', group: 'Base', values: impact },
  SI: { name: 'Subsequent system integrity', group: 'Base', values: impact },
  SA: { name: 'Subsequent system availability', group: 'Base', values: impact },
};
const modified = Object.fromEntries(
  Object.entries(base).map(([key, metric]) => [
    'M' + key,
    {
      name: 'Modified ' + metric.name.toLowerCase(),
      group: 'Environmental',
      values: {
        ...defined,
        ...metric.values,
        ...(key === 'SI' || key === 'SA' ? { S: 'Safety' } : {}),
      },
    },
  ]),
);
export const cvssMetrics: Record<string, Metric> = {
  ...base,
  E: {
    name: 'Exploit maturity',
    group: 'Threat',
    values: { X: 'Not defined', A: 'Attacked', P: 'Proof of concept', U: 'Unreported' },
  },
  CR: { name: 'Confidentiality requirement', group: 'Environmental', values: requirements },
  IR: { name: 'Integrity requirement', group: 'Environmental', values: requirements },
  AR: { name: 'Availability requirement', group: 'Environmental', values: requirements },
  ...modified,
  S: {
    name: 'Safety',
    group: 'Supplemental',
    values: { X: 'Not defined', N: 'Negligible', P: 'Present' },
  },
  AU: {
    name: 'Automatable',
    group: 'Supplemental',
    values: { X: 'Not defined', N: 'No', Y: 'Yes' },
  },
  R: {
    name: 'Recovery',
    group: 'Supplemental',
    values: { X: 'Not defined', A: 'Automatic', U: 'User', I: 'Irrecoverable' },
  },
  V: {
    name: 'Value density',
    group: 'Supplemental',
    values: { X: 'Not defined', D: 'Diffuse', C: 'Concentrated' },
  },
  RE: { name: 'Vulnerability response effort', group: 'Supplemental', values: requirements },
  U: {
    name: 'Provider urgency',
    group: 'Supplemental',
    values: { X: 'Not defined', Clear: 'Clear', Green: 'Green', Amber: 'Amber', Red: 'Red' },
  },
};

export const exampleVector = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N';

export function interpretCvss(value: string) {
  const vector = value.trim();
  if (vector.length > 1000 || !vector.startsWith('CVSS:4.0/'))
    throw new Error('Enter a CVSS:4.0 vector including all 11 Base metrics.');
  const order = Object.keys(cvssMetrics);
  let previousIndex = -1;
  const seen = new Set<string>();
  const selected = new Map<string, string>();
  for (const part of vector.slice('CVSS:4.0/'.length).split('/')) {
    const pair = part.split(':');
    const key = pair[0] ?? '';
    const code = pair[1] ?? '';
    const metric = Object.hasOwn(cvssMetrics, key) ? cvssMetrics[key] : undefined;
    if (pair.length !== 2 || !metric || !Object.hasOwn(metric.values, code))
      throw new Error(
        'Invalid CVSS 4.0 metric: ' + part + '. Names and values are case sensitive.',
      );
    if (seen.has(key)) throw new Error('Metric ' + key + ' appears more than once.');
    const index = order.indexOf(key);
    if (index <= previousIndex)
      throw new Error('Metric ' + key + ' is out of the required CVSS 4.0 order.');
    previousIndex = index;
    seen.add(key);
    selected.set(key, code);
  }
  const missing = Object.keys(base).filter((key) => !seen.has(key));
  if (missing.length) throw new Error('Missing required Base metrics: ' + missing.join(', ') + '.');
  const hasThreat = selected.has('E') && selected.get('E') !== 'X';
  const hasEnvironment = [...selected].some(
    ([key, code]) => cvssMetrics[key].group === 'Environmental' && code !== 'X',
  );
  const nomenclature = 'CVSS-B' + (hasThreat ? 'T' : '') + (hasEnvironment ? 'E' : '');
  const rows = [...selected].map(([key, code]) => ({
    key,
    metric: cvssMetrics[key].name,
    group: cvssMetrics[key].group,
    code,
    value: cvssMetrics[key].values[code],
  }));
  return toolkitResult(
    'cvss-vector',
    'CVSS 4.0 vector reader',
    { vector },
    [
      { label: 'Version', value: '4.0' },
      { label: 'Metric groups', value: nomenclature },
      { label: 'Explicit metrics', value: rows.length },
      { label: 'Numerical score', value: 'Not calculated by this reader' },
    ],
    {
      rows,
      columns: [
        { key: 'key', label: 'Code' },
        { key: 'metric', label: 'Metric' },
        { key: 'group', label: 'Group' },
        { key: 'value', label: 'Value' },
      ],
      sources: ['https://www.first.org/cvss/v4.0/specification-document'],
      data: { vector, calculatorUrl: 'https://www.first.org/cvss/calculator/4-0#' + vector },
      steps: [
        {
          title: 'Validate the vector',
          description:
            'All 11 Base metrics are present exactly once; metric order and case-sensitive values match the CVSS 4.0 specification.',
        },
        {
          title: 'Identify optional context',
          description:
            'Unspecified Threat, Environmental, and Supplemental metrics are Not Defined. Supplemental metrics do not alter the numerical score.',
        },
        {
          title: 'Use the complete assessment',
          description:
            'The official FIRST calculator can compute the score from this vector. Severity contributes to prioritization alongside exposure, assets, and organizational impact.',
        },
      ],
    },
  );
}

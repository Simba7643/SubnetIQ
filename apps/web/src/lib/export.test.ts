import { describe, expect, it } from 'vitest';
import type { CalculationResult } from '@subnetiq/shared';
import { csvCell, resultCsv } from './export';

describe('spreadsheet-safe exports', () => {
  it('escapes spreadsheet formula prefixes even behind whitespace and controls', () => {
    for (const text of [
      '=1+1',
      '+1+1',
      '-1+1',
      '@SUM(A1)',
      '  =1+1',
      '\t=1+1',
      '\r+1+1',
      '\n@SUM(A1)',
      '\u0000=1+1',
      '\u00a0=1+1',
    ])
      expect(csvCell(text)).toBe(`"'${text}"`);
  });

  it('preserves ordinary values, multiline descriptions, separators, and embedded quotes', () => {
    expect(csvCell('192.0.2.0/24')).toBe('"192.0.2.0/24"');
    expect(csvCell('hello,"world"\nnext line')).toBe('"hello,""world""\nnext line"');
    expect(csvCell(null)).toBe('""');
  });

  it('retains limitations, formulas, provenance, and full table rows in a result export', () => {
    const result: CalculationResult = {
      toolId: 'example',
      title: 'Example',
      normalizedInput: {},
      summary: [{ label: 'Range', value: '192.0.2.0/24', description: 'Documentation network' }],
      rows: [{ segment: '=HYPERLINK("https://example.test")', size: '256' }],
      columns: [
        { key: 'segment', label: 'Segment' },
        { key: 'size', label: 'Addresses' },
      ],
      warnings: ['Illustrative only'],
      steps: [{ title: 'Count', description: 'Prefix arithmetic', formula: '2^(32 − 24) = 256' }],
      engineVersion: '1.0.0',
      sources: ['https://www.rfc-editor.org/rfc/rfc5737'],
    };
    const csv = resultCsv(result);
    expect(csv).toContain('Illustrative only');
    expect(csv).toContain('2^(32 − 24) = 256');
    expect(csv).toContain('https://www.rfc-editor.org/rfc/rfc5737');
    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
    expect(csv).toContain('"Engine version","1.0.0"');
  });
});

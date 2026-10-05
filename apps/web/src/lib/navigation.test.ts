import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './navigation';

describe('authentication return paths', () => {
  it.each([
    '/tools/ipv4-subnet',
    '/projects/123',
    '/assistant',
    '/tools/vlsm?input=%7B%22network%22%3A%2210.0.0.0%2F8%22%7D#result',
  ])('preserves a valid local destination %s', (path) => expect(safeReturnTo(path)).toBe(path));
  it.each([
    undefined,
    null,
    '',
    'https://outside.example',
    '//outside.example',
    '/\\outside.example',
    '/\n/outside.example',
    '/\t/outside.example',
    '/\r/outside.example',
    '/auth',
    '/AUTH/reset',
    '/login?returnTo=/auth',
    '/tools/../auth',
    'javascript:alert(1)',
  ])('rejects external or looping destination %s', (path) =>
    expect(safeReturnTo(path)).toBe('/projects'),
  );
});

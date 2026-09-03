import { describe, expect, test } from 'bun:test';
import { resolveApiBaseFromLocation } from '../src/utils/connection';

describe('resolveApiBaseFromLocation', () => {
  test('maps the Vite dev port to the local CPA port', () => {
    expect(
      resolveApiBaseFromLocation({ protocol: 'http:', hostname: 'localhost', port: '5173' })
    ).toBe('http://127.0.0.1:8317');
  });

  test('keeps the Management API origin when the UI is served by CPA', () => {
    expect(
      resolveApiBaseFromLocation({ protocol: 'http:', hostname: '127.0.0.1', port: '8317' })
    ).toBe('http://127.0.0.1:8317');
  });

  test('does not rewrite a remote production host', () => {
    expect(
      resolveApiBaseFromLocation({
        protocol: 'https:',
        hostname: 'bugteam.cpa.aigcpro.org',
        port: '',
      })
    ).toBe('https://bugteam.cpa.aigcpro.org');
  });
});

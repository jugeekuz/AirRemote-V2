import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../args';

const repoCerts = resolve(import.meta.dirname, '../../../../certs');

describe('parseCliArgs', () => {
  it('normalises the MAC and applies the defaults', () => {
    expect(parseCliArgs(['--mac', 'aa:bb:cc:dd:ee:01'])).toEqual({
      ok: true,
      options: {
        mac: 'AA:BB:CC:DD:EE:01',
        server: 'https://localhost:8443',
        certsDir: repoCerts,
      },
    });
  });

  it('takes --server and --certs', () => {
    const result = parseCliArgs([
      '--mac',
      'AA:BB:CC:DD:EE:01',
      '--server',
      'https://192.168.1.10:8443',
      '--certs',
      '/tmp/certs',
    ]);
    expect(result).toMatchObject({
      ok: true,
      options: { server: 'https://192.168.1.10:8443', certsDir: '/tmp/certs' },
    });
  });

  it.each([[[]], [['--mac', 'aa-bb-cc-dd-ee-01']], [['--mac']]])(
    'explains --mac for %j',
    (argv) => {
      const result = parseCliArgs(argv);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('--mac AA:BB:CC:DD:EE:FF');
      }
    },
  );

  it.each(['localhost:8443', 'notaurl', 'http://localhost:8443'])(
    'explains --server for %j',
    (server) => {
      const result = parseCliArgs([
        '--mac',
        'AA:BB:CC:DD:EE:01',
        '--server',
        server,
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('https://');
    },
  );

  it('refuses an unknown option', () => {
    expect(parseCliArgs(['--mac', 'AA:BB:CC:DD:EE:01', '--nope']).ok).toBe(
      false,
    );
  });
});

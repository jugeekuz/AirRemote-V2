import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { createEmptyTestDatabase } from '../../../../backend/src/__tests__/test-db';
import { runMigrations } from '../migrations';

const migrationsFolder = resolve(import.meta.dirname, '../../migrations');

/** A copy of the migrations folder that stops after `lastTag`. */
async function migrationsUpTo(lastTag: string): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'airremote-migrations-'));
  await cp(migrationsFolder, folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
    entries: { tag: string }[];
  };
  const last = journal.entries.findIndex((entry) => entry.tag === lastTag);
  if (last === -1) throw new Error(`no migration ${lastTag}`);
  journal.entries = journal.entries.slice(0, last + 1);
  await writeFile(journalPath, JSON.stringify(journal));
  return folder;
}

describe('migrations', () => {
  it('backfills type on existing remotes', async () => {
    const database = await createEmptyTestDatabase();
    const client = postgres(database.url, { max: 1, onnotice: () => {} });
    const partial = await migrationsUpTo('0002_pairing_codes');
    try {
      await runMigrations(database.url, partial);
      const [user] = await client<{ id: string }[]>`
        insert into users (email, first_name, last_name, password_hash, password_salt)
        values ('nick@example.com', 'Nick', 'Papas', 'hash', 'salt') returning id`;
      const [device] = await client<{ id: string }[]>`
        insert into devices (user_id, mac_address, name)
        values (${user!.id}, 'aa:bb:cc:dd:ee:01', 'Hall') returning id`;
      await client`insert into remotes (device_id, name) values (${device!.id}, 'Living room')`;

      await runMigrations(database.url, migrationsFolder);

      expect(await client`select name, type from remotes`).toEqual([
        { name: 'Living room', type: 'generic_device' },
      ]);
      await expect(
        client`insert into remotes (device_id, name) values (${device!.id}, 'TV')`,
      ).rejects.toMatchObject({ code: '23502' });
    } finally {
      await client.end();
      await database.drop();
      await rm(partial, { recursive: true, force: true });
    }
  });
});

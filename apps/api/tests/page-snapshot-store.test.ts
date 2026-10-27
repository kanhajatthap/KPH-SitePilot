import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PAGE_SNAPSHOT_RETENTION_LIMIT } from '@wp-agent/contracts';
import type { CreatePageSnapshot } from '@wp-agent/contracts';
import {
  PageSnapshotStore,
} from '../src/page-snapshot-store.js';

const temporaryDirectories: string[] = [];

async function createStore(): Promise<{ store: PageSnapshotStore; directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'sitepilot-page-snapshots-'));
  temporaryDirectories.push(directory);
  return { store: new PageSnapshotStore(directory), directory };
}

function snapshotInput(overrides: Partial<CreatePageSnapshot> = {}): CreatePageSnapshot {
  return {
    targetSite: 'http://plugin-test.local',
    pageId: 42,
    title: 'About',
    slug: 'about',
    status: 'publish',
    content: '<p>Original page</p>',
    sourceOperation: 'page_update' as const,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe('PageSnapshotStore', () => {
  it('creates, lists, and reads snapshots only within their local page scope', async () => {
    const { store } = await createStore();
    const snapshot = await store.create(snapshotInput());

    expect(await store.list('http://plugin-test.local/', 42)).toEqual([snapshot]);
    expect(await store.get('http://plugin-test.local', 42, snapshot.id)).toEqual(snapshot);
    expect(await store.get('http://plugin-test.local', 43, snapshot.id)).toBeNull();
    expect(await store.list('http://another.local', 42)).toEqual([]);
  });

  it('rejects non-local targets and invalid page identifiers', async () => {
    const { store } = await createStore();

    await expect(store.create(snapshotInput({ targetSite: 'https://example.com' })))
      .rejects.toThrow('restricted to local WordPress sites');
    await expect(store.create(snapshotInput({ targetSite: 'http://plugin-test.local/?scope=other' })))
      .rejects.toThrow('cannot contain a query or fragment');
    await expect(store.list('http://plugin-test.local', 0)).rejects.toThrow();
  });

  it('enforces retention after concurrent creates and retains the newest snapshots', async () => {
    const { store, directory } = await createStore();
    const snapshots = await Promise.all(
      Array.from({ length: PAGE_SNAPSHOT_RETENTION_LIMIT + 1 }, (_, index) =>
        store.create(snapshotInput({ title: `Version ${index}` }))
      )
    );

    const retained = await store.list('http://plugin-test.local', 42);
    expect(retained).toHaveLength(PAGE_SNAPSHOT_RETENTION_LIMIT);
    expect(retained.map((snapshot) => snapshot.id)).toEqual(
      snapshots.slice(1).reverse().map((snapshot) => snapshot.id)
    );
    const oldestSnapshot = retained.at(-1)!;
    const backup = await store.create(snapshotInput({ sourceOperation: 'page_restore' }), oldestSnapshot.id);
    const afterRestore = await store.list('http://plugin-test.local', 42);
    expect(afterRestore).toHaveLength(PAGE_SNAPSHOT_RETENTION_LIMIT);
    expect(afterRestore.map((snapshot) => snapshot.id)).toContain(oldestSnapshot.id);
    expect(afterRestore[0].id).toBe(backup.id);
    const [scope] = await readdir(directory);
    expect(await readdir(join(directory, scope))).toHaveLength(PAGE_SNAPSHOT_RETENTION_LIMIT);
  }, 30_000);

  it('surfaces corrupt snapshot files rather than silently skipping them', async () => {
    const { store, directory } = await createStore();
    const created = await store.create(snapshotInput());
    const [scope] = await readdir(directory);
    const filePath = join(directory, scope, `${created.id}.json`);
    const existing = await readFile(filePath, 'utf8');
    await writeFile(filePath, `${existing}broken`, 'utf8');

    await expect(store.list('http://plugin-test.local', 42)).rejects.toThrow();
  });
});

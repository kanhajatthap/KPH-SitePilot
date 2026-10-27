import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CreatePageSnapshotSchema,
  PAGE_SNAPSHOT_RETENTION_LIMIT,
  PageSnapshotListRequestSchema,
  PageSnapshotReadRequestSchema,
  PageSnapshotSchema,
} from '@wp-agent/contracts';
import type { CreatePageSnapshot, PageSnapshot } from '@wp-agent/contracts';
import { isLocalPageTarget } from './page-target.js';

const DEFAULT_SNAPSHOT_ROOT = join(homedir(), '.wp-agent', 'page-snapshots');
const UUID_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/i;

function canonicalizeLocalSite(targetSite: string): string {
  if (!isLocalPageTarget(targetSite)) {
    throw new Error('Page snapshots are restricted to local WordPress sites.');
  }
  const url = new URL(targetSite);
  if (url.search || url.hash) {
    throw new Error('A page snapshot target cannot contain a query or fragment.');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname}`;
}

function scopeKey(targetSite: string, pageId: number): string {
  return createHash('sha256')
    .update(`${canonicalizeLocalSite(targetSite)}\0${pageId}`)
    .digest('hex');
}

function compareNewestFirst(left: PageSnapshot, right: PageSnapshot): number {
  return right.capturedAt.localeCompare(left.capturedAt) || right.id.localeCompare(left.id);
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export class PageSnapshotStore {
  private readonly rootDirectory: string;
  private readonly locks = new Map<string, Promise<void>>();

  constructor(rootDirectory = DEFAULT_SNAPSHOT_ROOT) {
    this.rootDirectory = rootDirectory;
  }

  async create(
    snapshotInput: CreatePageSnapshot,
    preserveSnapshotId?: string
  ): Promise<PageSnapshot> {
    const targetSite = canonicalizeLocalSite(snapshotInput.targetSite);
    const input = CreatePageSnapshotSchema.parse({
      ...snapshotInput,
      targetSite,
    });
    const key = scopeKey(targetSite, input.pageId);

    return this.withPageLock(key, async () => {
      const directory = join(this.rootDirectory, key);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const previousSnapshots = await this.readPage(directory, targetSite, input.pageId);
      const latestTimestamp = previousSnapshots[0]
        ? Date.parse(previousSnapshots[0].capturedAt)
        : 0;
      const capturedAt = new Date(Math.max(Date.now(), latestTimestamp + 1)).toISOString();
      const snapshot = PageSnapshotSchema.parse({
        ...input,
        id: randomUUID(),
        capturedAt,
      });
      const filePath = join(directory, `${snapshot.id}.json`);
      const temporaryPath = join(directory, `${snapshot.id}.${randomUUID()}.tmp`);

      try {
        await writeFile(temporaryPath, JSON.stringify(snapshot), {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        });
        await rename(temporaryPath, filePath);
      } catch (error) {
        try {
          await unlink(temporaryPath);
        } catch (cleanupError) {
          if (!isMissingFile(cleanupError)) {
            throw new AggregateError(
              [error, cleanupError],
              'Failed to save a page snapshot and clean up its temporary file.'
            );
          }
        }
        throw error;
      }

      const excessSnapshots = previousSnapshots.length + 1 - PAGE_SNAPSHOT_RETENTION_LIMIT;
      const removableSnapshots = previousSnapshots.filter(
        (existing) => existing.id !== preserveSnapshotId
      );
      for (const expired of excessSnapshots > 0
        ? removableSnapshots.slice(-excessSnapshots)
        : []) {
        await unlink(join(directory, `${expired.id}.json`));
      }

      return snapshot;
    });
  }

  async list(targetSite: string, pageId: number): Promise<PageSnapshot[]> {
    const request = PageSnapshotListRequestSchema.parse({ targetSite, pageId });
    const canonicalSite = canonicalizeLocalSite(request.targetSite);
    const key = scopeKey(canonicalSite, request.pageId);
    return this.withPageLock(key, async () => {
      const directory = join(this.rootDirectory, key);
      return this.readPage(directory, canonicalSite, request.pageId);
    });
  }

  async get(
    targetSite: string,
    pageId: number,
    snapshotId: string
  ): Promise<PageSnapshot | null> {
    const request = PageSnapshotReadRequestSchema.parse({ targetSite, pageId, snapshotId });
    const canonicalSite = canonicalizeLocalSite(request.targetSite);
    const key = scopeKey(canonicalSite, request.pageId);
    return this.withPageLock(key, async () => {
      const filePath = join(this.rootDirectory, key, `${request.snapshotId}.json`);
      let serialized: string;
      try {
        serialized = await readFile(filePath, 'utf8');
      } catch (error) {
        if (isMissingFile(error)) return null;
        throw error;
      }

      const snapshot = PageSnapshotSchema.parse(JSON.parse(serialized));
      if (
        snapshot.id !== request.snapshotId ||
        snapshot.targetSite !== canonicalSite ||
        snapshot.pageId !== request.pageId
      ) {
        throw new Error('Stored page snapshot does not match the requested page scope.');
      }
      return snapshot;
    });
  }

  private async readPage(
    directory: string,
    targetSite: string,
    pageId: number
  ): Promise<PageSnapshot[]> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }

    const snapshots: PageSnapshot[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !UUID_FILE_PATTERN.test(entry.name)) continue;
      const filePath = join(directory, entry.name);
      const snapshot = PageSnapshotSchema.parse(JSON.parse(await readFile(filePath, 'utf8')));
      if (
        `${snapshot.id}.json` !== entry.name ||
        snapshot.targetSite !== targetSite ||
        snapshot.pageId !== pageId
      ) {
        throw new Error(`Stored page snapshot ${entry.name} does not match its page scope.`);
      }
      snapshots.push(snapshot);
    }

    return snapshots.sort(compareNewestFirst);
  }

  private async withPageLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }
}

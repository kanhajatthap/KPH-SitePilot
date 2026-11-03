import type {
  CreateSpec,
  PatchSpec,
  ReadSpec,
  RepoRow,
  RepositoryClient,
  RepositoryError,
  Result,
  TableName,
} from './types.js';

export const TABLE_NAMES: readonly TableName[] = [
  'sites',
  'plans',
  'jobs',
  'snapshots',
  'audit_events',
  'usage_events',
];

export function isTableName(value: string): value is TableName {
  return (TABLE_NAMES as readonly string[]).includes(value);
}

function injected(message: string): RepositoryError {
  return { code: 'INJECTED_FAILURE', message };
}

function unexpected(error: unknown): RepositoryError {
  return { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : 'Unexpected repository error.' };
}

function project(row: RepoRow, columns?: readonly string[]): RepoRow {
  if (!columns || columns.length === 0) return { ...row };
  const picked: RepoRow = {};
  for (const column of columns) {
    if (column in row) picked[column] = row[column];
  }
  return picked;
}

function matches(row: RepoRow, filters: readonly { column: string; value: unknown }[]): boolean {
  return filters.every((filter) => row[filter.column] === filter.value);
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export interface RepositoryCall {
  op: 'read' | 'create' | 'patch';
  spec: ReadSpec | CreateSpec | PatchSpec;
}

export interface InMemoryRepositoryClient extends RepositoryClient {
  readonly calls: readonly RepositoryCall[];
  snapshot(table: TableName): RepoRow[];
}

export interface InMemoryOptions {
  seed?: Partial<Record<TableName, RepoRow[]>>;
  /** When set, every operation fails with this message (error-path tests). */
  failWith?: string;
  now?: () => string;
}

/**
 * A real, in-memory implementation of the repository port. It applies filters,
 * projection, ordering and limits for real — tests exercise behaviour, not just
 * "the mock was called". No network, no SDK, deterministic ids and timestamps.
 */
export function createInMemoryRepositoryClient(options: InMemoryOptions = {}): InMemoryRepositoryClient {
  const tables = new Map<TableName, RepoRow[]>();
  for (const table of TABLE_NAMES) {
    tables.set(table, (options.seed?.[table] ?? []).map((row) => ({ ...row })));
  }
  const calls: RepositoryCall[] = [];
  const now = options.now ?? (() => '2026-11-03T00:00:00.000Z');
  let sequence = 0;

  const fail = (): RepositoryError | null => (options.failWith ? injected(options.failWith) : null);

  return {
    get calls(): readonly RepositoryCall[] {
      return calls;
    },
    snapshot(table: TableName): RepoRow[] {
      return (tables.get(table) ?? []).map((row) => ({ ...row }));
    },
    async read<T>(spec: ReadSpec): Promise<Result<T[]>> {
      calls.push({ op: 'read', spec });
      const failure = fail();
      if (failure) return { data: null, error: failure };
      if (!isTableName(spec.table)) return { data: null, error: injected(`Unknown table: ${spec.table}`) };

      let rows = (tables.get(spec.table) ?? []).filter((row) => matches(row, spec.filters ?? []));
      if (spec.order) {
        const { column, ascending = false } = spec.order;
        rows = [...rows].sort((a, b) => {
          const result = compare(a[column], b[column]);
          return ascending ? result : -result;
        });
      }
      if (spec.limit !== undefined) rows = rows.slice(0, Math.max(0, spec.limit));
      return { data: rows.map((row) => project(row, spec.columns)) as T[], error: null };
    },
    async create<T>(spec: CreateSpec): Promise<Result<T>> {
      calls.push({ op: 'create', spec });
      const failure = fail();
      if (failure) return { data: null, error: failure };
      if (!isTableName(spec.table)) return { data: null, error: injected(`Unknown table: ${spec.table}`) };

      sequence += 1;
      const row: RepoRow = {
        id: `row-${spec.table}-${sequence}`,
        created_at: now(),
        ...spec.row,
      };
      tables.get(spec.table)!.push(row);
      return { data: project(row, spec.columns) as T, error: null };
    },
    async patch<T>(spec: PatchSpec): Promise<Result<T[]>> {
      calls.push({ op: 'patch', spec });
      const failure = fail();
      if (failure) return { data: null, error: failure };
      if (!isTableName(spec.table)) return { data: null, error: injected(`Unknown table: ${spec.table}`) };

      const changed: RepoRow[] = [];
      for (const row of tables.get(spec.table) ?? []) {
        if (!matches(row, spec.filters)) continue;
        Object.assign(row, spec.patch);
        changed.push(project(row, spec.columns));
      }
      return { data: changed as T[], error: null };
    },
  };
}

// ── Thin adapter for a real Supabase-like client ──────────────────────────────

export interface SupabaseResponse {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/** Minimal structural subset of the Supabase query builder. */
export interface SupabaseQuery extends PromiseLike<SupabaseResponse> {
  select(columns?: string): SupabaseQuery;
  eq(column: string, value: unknown): SupabaseQuery;
  order(column: string, options?: { ascending?: boolean }): SupabaseQuery;
  limit(count: number): SupabaseQuery;
  single(): SupabaseQuery;
}

export interface SupabaseTable {
  select(columns?: string): SupabaseQuery;
  insert(row: Record<string, unknown>): SupabaseQuery;
  update(patch: Record<string, unknown>): SupabaseQuery;
}

export interface SupabaseLike {
  from(table: string): SupabaseTable;
}

function toError(error: { message: string; code?: string }): RepositoryError {
  return { code: error.code ?? 'SUPABASE_ERROR', message: error.message };
}

function columnsOf(columns?: readonly string[]): string {
  return columns && columns.length > 0 ? columns.join(',') : '*';
}

function applyFilters(query: SupabaseQuery, filters: readonly { column: string; value: unknown }[]): SupabaseQuery {
  let result = query;
  for (const filter of filters) result = result.eq(filter.column, filter.value);
  return result;
}

/**
 * Production adapter. Filters are always pushed into the query (`.eq`), never
 * applied client-side, so RLS + owner scoping hold even with a service-role
 * client. Throw/catch keeps a network failure a typed error, never an exception
 * that leaks a stack frame to the UI.
 */
export function createSupabaseRepositoryClient(supabase: SupabaseLike): RepositoryClient {
  return {
    async read<T>(spec: ReadSpec): Promise<Result<T[]>> {
      try {
        let query: SupabaseQuery = supabase.from(spec.table).select(columnsOf(spec.columns));
        query = applyFilters(query, spec.filters ?? []);
        if (spec.order) {
          query = query.order(spec.order.column, { ascending: spec.order.ascending ?? false });
        }
        if (spec.limit !== undefined) query = query.limit(spec.limit);
        const response: SupabaseResponse = await query;
        if (response.error) return { data: null, error: toError(response.error) };
        return { data: (response.data ?? []) as T[], error: null };
      } catch (error) {
        return { data: null, error: unexpected(error) };
      }
    },
    async create<T>(spec: CreateSpec): Promise<Result<T>> {
      try {
        const response: SupabaseResponse = await supabase
          .from(spec.table)
          .insert(spec.row)
          .select(columnsOf(spec.columns))
          .single();
        if (response.error) return { data: null, error: toError(response.error) };
        return { data: (response.data ?? null) as T | null, error: null };
      } catch (error) {
        return { data: null, error: unexpected(error) };
      }
    },
    async patch<T>(spec: PatchSpec): Promise<Result<T[]>> {
      try {
        let query: SupabaseQuery = supabase.from(spec.table).update(spec.patch);
        query = applyFilters(query, spec.filters);
        const response: SupabaseResponse = await query.select(columnsOf(spec.columns));
        if (response.error) return { data: null, error: toError(response.error) };
        return { data: (response.data ?? []) as T[], error: null };
      } catch (error) {
        return { data: null, error: unexpected(error) };
      }
    },
  };
}

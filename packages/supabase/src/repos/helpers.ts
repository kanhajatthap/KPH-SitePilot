import type { Filter, Result } from './types.js';

/** Turns the first row of a successful read into a `T | null` result. */
export function firstOrNull<T>(result: Result<T[]>): Result<T | null> {
  if (result.error) return { data: null, error: result.error };
  return { data: result.data?.[0] ?? null, error: null };
}

/** Every repository read/patch starts with an explicit project scope. */
export function projectScope(projectId: string, ...extra: Filter[]): Filter[] {
  return [{ column: 'project_id', value: projectId }, ...extra];
}

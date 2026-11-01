import type { PairingCodeRow, PairingStore } from './pairing';
import { createSupabaseAdminClient } from '../supabase/admin';

/**
 * Supabase (service-role) implementation of the pairing storage port.
 *
 * `pairing_codes` and `sites` are service-only tables: neither is readable with
 * the anon key, and `sites.secret_encrypted` is additionally encrypted at the
 * application layer.
 */
export function createSupabasePairingStore(): PairingStore | null {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  return {
    async findPairingCode(codeHash: string): Promise<PairingCodeRow | null> {
      const { data, error } = await supabase
        .from('pairing_codes')
        .select('id, project_id, expires_at, used_at, used_by_site')
        .eq('code_hash', codeHash)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return (data as PairingCodeRow | null) ?? null;
    },

    async createSite(row) {
      const { data, error } = await supabase
        .from('sites')
        .insert(row)
        .select('id')
        .single();

      if (error) throw new Error(error.message);
      return { id: (data as { id: string }).id };
    },

    async markPairingCodeUsed(codeId: string, siteId: string) {
      const { error } = await supabase
        .from('pairing_codes')
        .update({ used_at: new Date().toISOString(), used_by_site: siteId })
        .eq('id', codeId)
        .is('used_at', null);

      if (error) throw new Error(error.message);
    },
  };
}

export interface CreatePairingCodeInput {
  projectId: string;
  createdBy: string;
  codeHash: string;
  expiresAt: string;
}

/** Inserts a pairing code row and returns its id. */
export async function insertPairingCode(input: CreatePairingCodeInput): Promise<string> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error('Connector storage is not configured.');

  const { data, error } = await supabase
    .from('pairing_codes')
    .insert({
      project_id: input.projectId,
      created_by: input.createdBy,
      code_hash: input.codeHash,
      expires_at: input.expiresAt,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/** Returns the caller's project id (first project they own), if any. */
export async function findOwnedProjectId(userId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as { id?: string } | undefined;
  return row?.id ?? null;
}

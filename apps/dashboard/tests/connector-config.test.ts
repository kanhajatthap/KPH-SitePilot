import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { GET as configRoute } from '../src/app/api/connector/config/route';

const saved = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  key: process.env.SITEPILOT_ENCRYPTION_KEY,
};

const bodyOf = async (res: Response) =>
  (await res.json()) as {
    authEnabled: boolean;
    storage: boolean;
    encryption: boolean;
    ready: boolean;
    hints: string[];
  };

describe('connector config probe', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SITEPILOT_ENCRYPTION_KEY;
  });

  afterEach(() => {
    if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.anon;
    if (saved.key === undefined) delete process.env.SITEPILOT_ENCRYPTION_KEY;
    else process.env.SITEPILOT_ENCRYPTION_KEY = saved.key;
  });

  it('reports every missing piece with a hint and never a value', async () => {
    const body = await bodyOf(await configRoute());

    expect(body.ready).toBe(false);
    expect(body.authEnabled).toBe(false);
    expect(body.encryption).toBe(false);
    expect(body.hints.length).toBeGreaterThan(0);
    // Booleans and sentences only: no key material, no host, no prefix.
    expect(JSON.stringify(body)).not.toMatch(/eyJ|supabase\.co|sk_/);
  });

  it('is not ready when the encryption key is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-placeholder';

    const body = await bodyOf(await configRoute());
    expect(body.authEnabled).toBe(true);
    expect(body.encryption).toBe(false);
    expect(body.ready).toBe(false);
    expect(body.hints.join(' ')).toMatch(/ENCRYPTION/i);
  });
});

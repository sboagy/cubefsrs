/// <reference types="vite/client" />
import { createSupabaseClient } from "@rhizome/core";

let _client: ReturnType<typeof createSupabaseClient> | null = null;

/**
 * Returns the Supabase client singleton, or null when VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY environment variables are absent.
 *
 * Auth features are silently disabled in offline / dev-without-supabase mode.
 */
export function getSupabaseClient() {
	const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
	const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

	if (!url || !anonKey) {
		if (import.meta.env.DEV) {
			console.warn(
				"[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Auth disabled.",
			);
		}
		return null;
	}

	if (!_client) {
		_client = createSupabaseClient({ url, anonKey, storageKey: "cubefsrs-auth" });
	}
	return _client;
}

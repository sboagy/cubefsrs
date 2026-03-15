/**
 * Module-level state for the SQLite DB lifecycle.
 *
 * - `dbReady`: reactive signal, true once initializeDb has completed for
 *   the current user.
 * - `currentUserId`: the user ID of the currently signed-in user; consumed
 *   by store mutation functions to identify which user's rows to write.
 */
import { createSignal } from "solid-js";

export const [dbReady, setDbReady] = createSignal(false);

let _currentUserId: string | null = null;

export function setCurrentUserId(id: string | null): void {
	_currentUserId = id;
}

export function getCurrentUserId(): string | null {
	return _currentUserId;
}

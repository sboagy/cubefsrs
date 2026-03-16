/**
 * Sync Module - Re-export Layer
 *
 * Re-exports sync functionality from the linked `oosync` package.
 * The `import "./runtime-config"` call ensures the browser sync runtime is
 * registered before any sync operations are performed.
 *
 * @module lib/sync
 */

import "./runtime-config";

export type {
	SyncableTable,
	SyncOperation,
	SyncResult,
	SyncStatus,
} from "oosync/sync";

export {
	clearOldOutboxItems,
	clearSyncOutbox,
	getFailedOutboxItems,
	getOutboxStats,
	RealtimeManager,
	retryOutboxItem,
	SyncEngine,
	SyncInProgressError,
	SyncService,
	startSyncWorker,
} from "oosync/sync";

export { ensureSyncRuntimeConfigured } from "./runtime-config";

/**
 * Persistence boundary for v1.
 * Local AsyncStorage is always the UI source of truth.
 * Google users sync to Firestore via `@/shared/sync` (online push + offline queue).
 */
export {
  loadStore,
  getStore,
  saveStore,
  updateStore,
  subscribeStore,
  emptyStore,
} from '@/shared/storage/local-store';

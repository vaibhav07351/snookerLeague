/**
 * Persistence boundary for v1.
 * Local AsyncStorage is the active store. Firestore swap = new repository
 * implementations behind the same service APIs (see claude.md).
 */
export {
  loadStore,
  getStore,
  saveStore,
  updateStore,
  subscribeStore,
  emptyStore,
} from '@/shared/storage/local-store';

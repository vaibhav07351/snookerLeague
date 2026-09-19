import { getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { z } from 'zod';

import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { isOnline } from '@/shared/sync/connectivity';
import { directoryListingsCol, shouldCloudSync } from '@/shared/sync/firestore-paths';
import { scheduleSync } from '@/shared/sync';
import { createId, nowIso } from '@/shared/utils/id';
import type { DirectoryKind, DirectoryListing } from '@/shared/types/domain';

const PAGE = 20;

const createSchema = z.object({
  cityId: z.string().min(1),
  cityName: z.string().trim().min(1).max(80),
  kind: z.enum(['club', 'table', 'referee', 'organiser']),
  name: z.string().trim().min(2).max(80),
  detail: z.string().trim().max(200),
});

export const DIRECTORY_KIND_LABEL: Record<DirectoryKind, string> = {
  club: 'Clubs',
  table: 'Tables',
  referee: 'Referees',
  organiser: 'Organisers',
};

function asListing(data: Record<string, unknown>, id: string): DirectoryListing {
  const kind = data.kind;
  return {
    id,
    cityId: String(data.cityId ?? ''),
    cityName: String(data.cityName ?? ''),
    kind:
      kind === 'table' || kind === 'referee' || kind === 'organiser' || kind === 'club'
        ? kind
        : 'club',
    name: String(data.name ?? ''),
    detail: String(data.detail ?? ''),
    createdByUid: String(data.createdByUid ?? ''),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? data.createdAt ?? ''),
  };
}

async function persist(listing: DirectoryListing): Promise<void> {
  await updateStore((s) => {
    const has = s.directoryListings.some((row) => row.id === listing.id);
    return {
      ...s,
      directoryListings: has
        ? s.directoryListings.map((row) => (row.id === listing.id ? listing : row))
        : [...s.directoryListings, listing],
    };
  });
  await scheduleSync([
    {
      entity: 'directory',
      docId: listing.id,
      leagueId: null,
      action: 'upsert',
      payload: listing,
      updatedAt: listing.updatedAt,
    },
  ]);
}

export async function createDirectoryListing(input: {
  cityId: string;
  cityName: string;
  kind: DirectoryKind;
  name: string;
  detail: string;
}): Promise<DirectoryListing> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Need a name for this listing');
  }
  await loadStore();
  const user = getStore().user;
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Sign in first');
  }
  const now = nowIso();
  const listing: DirectoryListing = {
    id: createId('dl'),
    cityId: parsed.data.cityId,
    cityName: parsed.data.cityName,
    kind: parsed.data.kind,
    name: parsed.data.name,
    detail: parsed.data.detail,
    createdByUid: user.uid,
    createdAt: now,
    updatedAt: now,
  };
  await persist(listing);
  logger.info('directory.service', 'Directory listing created', {
    listingId: listing.id,
    kind: listing.kind,
  });
  return listing;
}

export async function deleteDirectoryListing(listingId: string): Promise<void> {
  await loadStore();
  const user = getStore().user;
  const listing = getStore().directoryListings.find((row) => row.id === listingId);
  if (!user || !listing) {
    throw new AppError('NOT_FOUND', 'Listing not found');
  }
  if (listing.createdByUid !== user.uid) {
    throw new AppError('FORBIDDEN', 'Only you can remove this listing');
  }
  await updateStore((s) => ({
    ...s,
    directoryListings: s.directoryListings.filter((row) => row.id !== listingId),
  }));
  await scheduleSync([
    {
      entity: 'directory',
      docId: listingId,
      leagueId: null,
      action: 'delete',
      payload: null,
      updatedAt: nowIso(),
    },
  ]);
  logger.info('directory.service', 'Directory listing deleted', { listingId });
}

export async function listDirectory(input: {
  cityId: string;
  kind: DirectoryKind;
}): Promise<DirectoryListing[]> {
  await loadStore();
  const user = getStore().user;
  if (shouldCloudSync(user) && isOnline()) {
    try {
      const snap = await getDocs(
        query(
          directoryListingsCol(),
          where('cityId', '==', input.cityId),
          where('kind', '==', input.kind),
          orderBy('createdAt', 'desc'),
          limit(PAGE),
        ),
      );
      const remote = snap.docs.map((d) => asListing(d.data(), d.id));
      await updateStore((s) => {
        const map = new Map(s.directoryListings.map((row) => [row.id, row]));
        for (const row of remote) {
          map.set(row.id, row);
        }
        return { ...s, directoryListings: [...map.values()] };
      });
    } catch (error) {
      logger.error('directory.service', 'Directory query failed', {
        shape: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  return getStore()
    .directoryListings.filter((row) => row.cityId === input.cityId && row.kind === input.kind)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, PAGE);
}

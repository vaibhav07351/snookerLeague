import { listFollowGraph } from '@/features/community/services/follow.service';
import { listLookingPosts } from '@/features/community/services/looking.service';
import { isStale } from '@/features/home/services/live-staleness';
import { getCityHubForUser } from '@/features/league/services/city-hub.service';
import { listLiveMatches } from '@/features/match/services/match.service';
import { getStore } from '@/shared/storage/local-store';
import type { FeedEvent, GroupMatch, Match, Race } from '@/shared/types/domain';
import { cityHubId, matchPlayedAt } from '@/shared/types/domain';
import { visibleEvents } from '@/shared/utils/result-event';

export type HomeFilter = 'your' | 'played' | 'network' | 'all';

export interface HomeActivity {
  id: string;
  at: string;
  title: string;
  body: string;
  href?: string;
}

function playerInMatch(match: Match, playerId: string | null): boolean {
  if (!playerId) {
    return false;
  }
  return match.teamA.includes(playerId) || match.teamB.includes(playerId);
}

function playerInRace(race: Race, playerId: string | null): boolean {
  if (!playerId) {
    return false;
  }
  return race.entrants.some((e) => e.playerId === playerId);
}

export async function refreshHomeNetworkSources(input: {
  myUid: string;
  cityId: string | null;
}): Promise<void> {
  await listFollowGraph(input.myUid);
  if (!input.cityId) {
    return;
  }
  await listLookingPosts({ cityId: input.cityId, kind: 'all', includeClosed: false });
  const hub = await getCityHubForUser(input.myUid);
  if (hub) {
    await listLiveMatches(hub.id);
  }
}

export function listHomeActivity(input: {
  filter: HomeFilter;
  leagueId: string;
  myPlayerId: string | null;
  myUid: string;
  cityId: string | null;
  events: FeedEvent[];
  matches: Match[];
  races: Race[];
  groupMatches: GroupMatch[];
  /** Current time in ms; defaults to Date.now(), passed in tests. */
  now?: number;
}): HomeActivity[] {
  const store = getStore();
  const following = new Set(
    store.follows.filter((row) => row.followerUid === input.myUid).map((row) => row.followingUid),
  );

  if (input.filter === 'all') {
    return visibleEvents(input.events)
      .filter((e) => e.leagueId === input.leagueId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map((e) => ({ id: e.id, at: e.createdAt, title: e.title, body: e.body }));
  }

  if (input.filter === 'your') {
    return visibleEvents(input.events)
      .filter(
        (e) =>
          e.leagueId === input.leagueId &&
          (input.myPlayerId ? e.relatedIds.includes(input.myPlayerId) : false),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map((e) => ({ id: e.id, at: e.createdAt, title: e.title, body: e.body }));
  }

  if (input.filter === 'played') {
    const matchRows: HomeActivity[] = input.matches
      .filter(
        (m) =>
          m.leagueId === input.leagueId &&
          m.outcome.status !== 'in_progress' &&
          playerInMatch(m, input.myPlayerId),
      )
      .map((m) => ({
        id: m.id,
        at: matchPlayedAt(m),
        title: m.namedLabel ?? 'Match',
        body: `${m.outcome.framesA}–${m.outcome.framesB}`,
        href: `/match/${m.id}`,
      }));
    const raceRows: HomeActivity[] = input.races
      .filter(
        (r) =>
          r.leagueId === input.leagueId &&
          r.status === 'completed' &&
          playerInRace(r, input.myPlayerId),
      )
      .map((r) => ({
        id: r.id,
        at: r.updatedAt,
        title: r.namedLabel ?? `Race to ${r.targetScore}`,
        body: 'Finished',
        href: `/race/${r.id}`,
      }));
    const myId = input.myPlayerId;
    const groupRows: HomeActivity[] = input.groupMatches
      .filter(
        (g) =>
          g.leagueId === input.leagueId &&
          g.status === 'completed' &&
          myId != null &&
          g.playerIds.includes(myId),
      )
      .map((g) => ({
        id: g.id,
        at: g.updatedAt,
        title: g.namedLabel ?? 'Free-for-all',
        body: g.winnerId === myId ? 'Won' : 'Finished',
        href: `/group/${g.id}`,
      }));
    return [...matchRows, ...groupRows, ...raceRows]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20);
  }

  const hubId = input.cityId ? cityHubId(input.cityId) : null;
  // A city match nobody has scored for 12 hours is not "live" any more.
  const now = input.now ?? Date.now();
  const cityMatches: HomeActivity[] = store.matches
    .filter(
      (m) =>
        hubId &&
        m.leagueId === hubId &&
        m.outcome.status === 'in_progress' &&
        !isStale(m.updatedAt, now),
    )
    .map((m) => ({
      id: m.id,
      at: m.updatedAt,
      title: m.namedLabel ?? 'Live city match',
      body: `Frames ${m.outcome.framesA}–${m.outcome.framesB}`,
      href: `/match/${m.id}`,
    }));
  const looking: HomeActivity[] = store.lookingPosts
    .filter((p) => input.cityId && p.cityId === input.cityId && p.status === 'open')
    .map((p) => ({
      id: p.id,
      at: p.createdAt,
      title: p.title,
      body: `${p.authorName} · Looking`,
      href: '/(main)/looking',
    }));
  const followedProfiles = store.playerProfiles.filter((p) => following.has(p.uid));
  const networkNotes: HomeActivity[] = followedProfiles.map((p) => ({
    id: `net-${p.uid}`,
    at: p.updatedAt,
    title: p.displayName,
    body: `${p.winPct}% · ${p.played} city games`,
    href: `/(main)/city-player?uid=${p.uid}`,
  }));

  return [...cityMatches, ...looking, ...networkNotes]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20);
}

export function homeActivityEmptyCopy(filter: HomeFilter): string {
  if (filter === 'your') {
    return 'Nothing tagged to you yet.';
  }
  if (filter === 'played') {
    return 'No finished games on your card yet.';
  }
  if (filter === 'network') {
    return 'Follow players or open a Looking post to fill this.';
  }
  return 'Nothing yet — your first result lands here.';
}

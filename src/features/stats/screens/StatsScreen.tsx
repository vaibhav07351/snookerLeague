import { useState, type ReactNode } from 'react';

import { useSession } from '@/features/auth/hooks/use-session';
import { Screen } from '@/features/home/components/Screen';
import { PlayerDashboard } from '@/features/stats/components/PlayerDashboard';
import { PlayerPickerSheet } from '@/features/stats/components/PlayerPickerSheet';
import { useLeagueStats } from '@/features/stats/hooks/use-league-stats';
import { LoadingState } from '@/shared/ui/LoadingState';

/** Your numbers by default; tap the name to look at anyone in the league. */
export function StatsScreen(): ReactNode {
  const { user, league } = useSession();
  const stats = useLeagueStats(league?.id, user?.uid);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  if (!league || !user || !stats.ready) {
    return (
      <Screen scroll={false}>
        <LoadingState label="Loading stats" />
      </Screen>
    );
  }

  const selectedId =
    (chosenId && stats.playerById.has(chosenId) ? chosenId : null) ??
    stats.meId ??
    stats.players[0]?.id ??
    null;
  const isMe = selectedId != null && selectedId === stats.meId;

  return (
    <Screen scroll={false}>
      <PlayerDashboard
        stats={stats}
        playerId={selectedId}
        tabs={['overview', 'breaks', 'pace', 'rivals', 'records']}
        subtitle={isMe ? `You · ${league.name}` : league.name}
        onNamePress={stats.players.length > 1 ? () => setPicking(true) : undefined}
      />
      <PlayerPickerSheet
        visible={picking}
        title="Show stats for"
        players={stats.players}
        ratings={stats.ratings}
        selectedId={selectedId}
        meId={stats.meId}
        onSelect={setChosenId}
        onClose={() => setPicking(false)}
      />
    </Screen>
  );
}

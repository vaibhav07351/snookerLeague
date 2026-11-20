import { useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { MatchTimingHeader } from '@/features/match/components/MatchTimingHeader';
import { matchService, type MatchScreenState } from '@/features/match/hooks/use-match-screen';
import { RulesButton } from '@/features/rules/components/RulesButton';
import { matchRules } from '@/features/rules/services/rules';
import { HeaderBack } from '@/shared/ui/HeaderBack';

import type { Match } from '@/shared/types/domain';

/** The match screen's header: its title, the rules button and, while live, the frame timer. */
export function useMatchHeader(
  match: Match | null | undefined,
  { run, busy, canScore }: Pick<MatchScreenState, 'run' | 'busy' | 'canScore'>,
): void {
  const navigation = useNavigation();
  const id = match?.id;
  const inProgress = match?.outcome.status === 'in_progress';
  const timingOn = match?.timingEnabled === true;
  const frameStartedAt = match?.frameStartedAt ?? null;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: match ? match.namedLabel || (match.crownsChampion ? 'Title match' : 'Match') : 'Match',
      headerLeft: () => <HeaderBack fallback="/(main)" />,
      headerRight: match
        ? () => (
            <View style={styles.headerRight}>
              <RulesButton
                iconOnly
                rules={matchRules(
                  matchService.oddBestOf(match.bestOf),
                  matchService.matchFormatOf(match),
                )}
              />
              {inProgress && id ? (
                <MatchTimingHeader
                  enabled={timingOn}
                  startedAt={frameStartedAt}
                  disabled={busy || !canScore}
                  onToggle={(next) =>
                    void run('Could not change the timer', () =>
                      matchService.setMatchTiming(id, next),
                    )
                  }
                />
              ) : null}
            </View>
          )
        : undefined,
    });
  }, [navigation, match, id, inProgress, timingOn, frameStartedAt, busy, canScore, run]);
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
});

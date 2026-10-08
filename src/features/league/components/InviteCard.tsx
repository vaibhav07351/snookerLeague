import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/features/home/components/Button';
import { inviteUrl, shareLeagueInvite } from '@/features/league/services/invite-link.service';
import * as leagueService from '@/features/league/services/league.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { Card } from '@/shared/ui/Card';
import { notify } from '@/shared/ui/notify';
import type { League } from '@/shared/types/domain';
import { confirmAction } from '@/shared/utils/confirm';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

interface InviteCardProps {
  league: League;
  /** Signed-in uid; the owner also gets "New code". */
  uid: string;
  compact?: boolean;
}

/** Invite friends: share link (or code), and for the owner, reset the code. */
export function InviteCard({ league, uid, compact = false }: InviteCardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const [busy, setBusy] = useState(false);
  const isOwner = league.createdByUid === uid;

  // Older leagues have no online invite record yet; make sure the code works for friends.
  useEffect(() => {
    void leagueService.ensureInviteDoc(league.id);
  }, [league.id, league.inviteCode]);

  async function share(): Promise<void> {
    setBusy(true);
    try {
      const result = await shareLeagueInvite(league);
      if (result === 'copied') {
        notify.success('Invite copied', 'Paste it into WhatsApp or a message to your friends.');
      }
    } catch (error) {
      notify.error('Could not share', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(): Promise<void> {
    const ok = await confirmAction(
      'Make a new invite code?',
      'The old code and links stop working. People already in the league stay in.',
      'New code',
    );
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      await leagueService.regenerateInviteCode(league.id, uid);
      notify.success('New invite code ready');
    } catch (error) {
      notify.error('Could not change the code', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tone="highlight">
      <Text style={typography.label}>Invite friends to {league.name}</Text>
      <View style={styles.codeRow}>
        <Text
          style={styles.code}
          selectable
          accessibilityLabel={`Invite code ${league.inviteCode.split('').join(' ')}`}
        >
          {league.inviteCode}
        </Text>
      </View>
      {!compact ? (
        <Text style={styles.link} selectable numberOfLines={2}>
          {inviteUrl(league.inviteCode)}
        </Text>
      ) : null}
      <Text style={styles.hint}>
        Friends tap the link (or enter the code under Join a league), sign in with Google and pick
        their player.
      </Text>
      <View style={styles.actions}>
        <Button
          label="Share invite"
          icon="share-social-outline"
          onPress={() => void share()}
          loading={busy}
          style={styles.flex}
        />
        {isOwner && !compact ? (
          <Button
            label="New code"
            variant="secondary"
            icon="refresh"
            onPress={() => void regenerate()}
            disabled={busy}
          />
        ) : null}
      </View>
    </Card>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    codeRow: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.borderStrong,
    },
    code: {
      fontFamily: fonts.display,
      fontSize: 28,
      letterSpacing: 4,
      color: c.text,
    },
    link: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.info,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    flex: {
      flexGrow: 1,
    },
  });

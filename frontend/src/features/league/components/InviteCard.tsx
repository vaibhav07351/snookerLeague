import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { shareLeagueInvite } from '@/features/league/services/invite-link.service';
import * as leagueService from '@/features/league/services/league.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { Card } from '@/shared/ui/Card';
import { notify } from '@/shared/ui/notify';
import type { League } from '@/shared/types/domain';
import { confirmAction } from '@/shared/utils/confirm';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import {
  TOUCH_TARGET,
  fonts,
  makeTypography,
  radii,
  spacing,
  typeScale,
  type Palette,
} from '@/theme/tokens';

interface InviteCardProps {
  league: League;
  /** Signed-in uid; the owner also gets "New code". */
  uid: string;
}

/** Invite friends: share link (or code), and for the owner, reset the code. */
export function InviteCard({ league, uid }: InviteCardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const isOwner = league.createdByUid === uid;

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
      <Text style={typography.label} numberOfLines={1}>
        Invite friends to {league.name}
      </Text>
      <View style={styles.row}>
        <View style={styles.codeRow}>
          <Text
            style={styles.code}
            selectable
            accessibilityLabel={`Invite code ${league.inviteCode.split('').join(' ')}`}
          >
            {league.inviteCode}
          </Text>
        </View>
        <Button
          label="Share"
          icon="share-social-outline"
          onPress={() => void share()}
          loading={busy}
          style={styles.flex}
        />
        {isOwner ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Make a new invite code"
            disabled={busy}
            onPress={() => void regenerate()}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <Ionicons name="refresh" size={20} color={palette.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.hint}>Friends tap the link, sign in and pick their player.</Text>
    </Card>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    iconBtn: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.6,
    },
    codeRow: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.borderStrong,
    },
    code: {
      fontFamily: fonts.display,
      fontSize: typeScale.title1,
      letterSpacing: 3,
      color: c.text,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: typeScale.small,
      lineHeight: 18,
      color: c.textMuted,
    },
    flex: {
      flex: 1,
      minWidth: 0,
    },
  });

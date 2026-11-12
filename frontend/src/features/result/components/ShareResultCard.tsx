import { useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '@/features/home/components/BrandLogo';
import { shareResultCard, shareResultLink } from '@/features/result/services/share-result.service';
import type { ResultView } from '@/features/result/types/result.types';
import { toUserMessage } from '@/shared/errors/app-error';
import { Button } from '@/shared/ui/Button';
import { notify } from '@/shared/ui/notify';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

/** Places shown on a race or free-for-all card; enough for a picture, not a full table. */
const SHARE_ROWS = 4;

/** A branded result card plus "Share card" and "Share link", for any finished game. */
export function ShareResultCard({ view }: { view: ResultView }): ReactNode {
  const styles = useStyles(makeStyles);
  const card = useRef<View>(null);
  const onError = (error: unknown): void => notify.error('Could not share', toUserMessage(error));
  const { sides } = view;

  return (
    <View style={styles.wrap}>
      <View ref={card} collapsable={false} style={styles.card}>
        <View style={styles.brand}>
          <BrandLogo size={28} />
          <Text style={styles.brandText}>Snookit</Text>
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {view.label}
          {view.caption ? ` · ${view.caption}` : ''}
        </Text>
        {sides ? (
          <View style={styles.scoreRow}>
            <Text style={[styles.side, sides.winner === 'a' && styles.winner]} numberOfLines={2}>
              {sides.a}
            </Text>
            <Text style={styles.score}>
              {sides.framesA} - {sides.framesB}
            </Text>
            <Text
              style={[styles.side, styles.right, sides.winner === 'b' && styles.winner]}
              numberOfLines={2}
            >
              {sides.b}
            </Text>
          </View>
        ) : (
          <View style={styles.rows}>
            {view.standings.slice(0, SHARE_ROWS).map((r) => (
              <View key={`${r.place}-${r.name}`} style={styles.row}>
                <Text style={styles.place}>{r.place}</Text>
                <Text style={[styles.name, r.winner && styles.winner]} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={styles.detail}>{r.detail}</Text>
              </View>
            ))}
          </View>
        )}
        {view.notes.map((note) => (
          <Text key={note} style={styles.extra}>
            {note}
          </Text>
        ))}
      </View>
      <View style={styles.buttons}>
        <Button
          label="Share card"
          icon="image-outline"
          size="sm"
          onPress={() =>
            void shareResultCard(card, view.kind, view.id, view.summary).catch(onError)
          }
          style={styles.button}
        />
        <Button
          label="Share link"
          icon="link-outline"
          size="sm"
          variant="secondary"
          onPress={() => void shareResultLink(view.kind, view.id, view.summary).catch(onError)}
          style={styles.button}
        />
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    card: {
      backgroundColor: c.bgElevated,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.borderStrong,
      padding: spacing.md,
      gap: spacing.sm,
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    brandText: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.bodyLarge,
      color: c.text,
    },
    label: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.small,
      color: c.textMuted,
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    side: {
      flex: 1,
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.lead,
      color: c.text,
    },
    right: {
      textAlign: 'right',
    },
    winner: {
      color: c.primary,
    },
    score: {
      fontFamily: fonts.display,
      fontSize: typeScale.displayLarge,
      color: c.text,
    },
    rows: {
      gap: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    place: {
      width: 28,
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.body,
      color: c.textMuted,
    },
    name: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.lead,
      color: c.text,
    },
    detail: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.small,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    extra: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.small,
      color: c.primary,
    },
    buttons: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    button: {
      flex: 1,
      minWidth: 0,
    },
  });

import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  createLookingPost,
  LOOKING_KIND_LABEL,
} from '@/features/community/services/looking.service';
import { toUserMessage } from '@/shared/errors/app-error';
import type { LookingKind } from '@/shared/types/domain';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { Chip } from '@/shared/ui/Chip';
import { notify } from '@/shared/ui/notify';
import { TextField } from '@/shared/ui/TextField';
import { useStyles } from '@/theme/ThemeProvider';
import { makeTypography, spacing } from '@/theme/tokens';

interface LookingComposeSheetProps {
  visible: boolean;
  onClose: () => void;
  cityId: string;
  cityName: string;
}

/** Write a "Looking" post for players in my city: what for, a title and details. */
export function LookingComposeSheet({
  visible,
  onClose,
  cityId,
  cityName,
}: LookingComposeSheetProps): ReactNode {
  const typography = useStyles(makeTypography);
  const [kind, setKind] = useState<LookingKind>('opponent');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function publish(): Promise<void> {
    setBusy(true);
    try {
      await createLookingPost({ cityId, cityName, kind, title, body });
      setTitle('');
      setBody('');
      onClose();
    } catch (error) {
      notify.error('Could not post', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={visible} title="New post" onClose={onClose}>
      <View style={styles.body}>
        <Text style={typography.label}>What are you looking for?</Text>
        <View style={styles.chips}>
          {(Object.keys(LOOKING_KIND_LABEL) as LookingKind[]).map((k) => (
            <Chip
              key={k}
              label={LOOKING_KIND_LABEL[k]}
              selected={kind === k}
              onPress={() => setKind(k)}
            />
          ))}
        </View>
        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="Friday frames?"
        />
        <TextField
          label="Details"
          value={body}
          onChangeText={setBody}
          placeholder="Best of 5, around 7pm..."
        />
        <Button label="Post" onPress={() => void publish()} loading={busy} disabled={busy} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});

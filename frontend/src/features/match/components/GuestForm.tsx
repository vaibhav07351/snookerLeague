import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { TextField } from '@/shared/ui/TextField';
import { spacing } from '@/theme/tokens';

interface GuestFormProps {
  onAdd: (name: string) => Promise<void>;
  onCancel: () => void;
}

/** Inline "add a guest": a name and Add, without leaving the match being set up. */
export function GuestForm({ onAdd, onCancel }: GuestFormProps): ReactNode {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = name.trim().length >= 2;
  const submit = async (): Promise<void> => {
    if (!valid || saving) {
      return;
    }
    setSaving(true);
    try {
      await onAdd(name.trim());
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card style={styles.card}>
      <TextField
        label="Guest name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Rahul Sharma"
        maxLength={40}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <View style={styles.actions}>
        <Button label="Cancel" size="sm" variant="ghost" onPress={onCancel} style={styles.flex} />
        <Button
          label="Add guest"
          icon="person-add-outline"
          size="sm"
          loading={saving}
          disabled={!valid || saving}
          onPress={() => void submit()}
          style={styles.flex}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});

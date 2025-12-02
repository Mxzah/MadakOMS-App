import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../kitchen/constants';
import type { StaffUser } from '../types';
import { styles } from '../styles';
import type { KitchenTheme } from '../../kitchen/types';

type ResetPasswordModalProps = {
  visible: boolean;
  staff: StaffUser | null;
  onClose: () => void;
  theme?: KitchenTheme;
  isDark?: boolean;
};

export function ResetPasswordModal({ visible, staff, onClose, theme, isDark = false }: ResetPasswordModalProps) {
  const [mode, setMode] = useState<'random' | 'custom'>('random');
  const [customPassword, setCustomPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Utiliser le thème par défaut si non fourni
  const currentTheme = theme || {
    background: colors.background,
    surface: colors.surface,
    surfaceMuted: '#F6F7FB',
    textPrimary: colors.dark,
    textSecondary: colors.muted,
    border: colors.border,
    pillActiveBg: colors.accent,
    pillActiveText: '#FFFFFF',
  };

  const handleConfirm = useCallback(async () => {
    if (!staff) return;

    if (mode === 'custom' && !customPassword.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un mot de passe personnalisé.');
      return;
    }

    try {
      setLoading(true);
      
      const bodyPayload: any = {
        action: 'reset_password',
        authUserId: staff.authUserId,
      };
      
      if (mode === 'custom') {
        const trimmedPassword = customPassword.trim();
        if (trimmedPassword.length > 0) {
          bodyPayload.password = trimmedPassword;
        }
      }

      const { data, error } = await supabase.functions.invoke('staff-admin', {
        body: bodyPayload,
      });

      if (error) {
        console.warn(error);
        Alert.alert('Erreur', 'Impossible de réinitialiser le mot de passe.');
        return;
      }

      const newPassword = (data as any)?.tempPassword as string | undefined;
      if (newPassword) {
        onClose();
        Alert.alert(
          'Mot de passe réinitialisé',
          `Nouveau mot de passe pour ${staff.username} :\n\n${newPassword}\n\nCommuniquez ce mot de passe au membre.`,
          [{ text: 'OK' }],
        );
        setCustomPassword('');
      } else {
        Alert.alert('Erreur', 'Le mot de passe a été réinitialisé mais le nouveau mot de passe n\'a pas été retourné.');
      }
    } finally {
      setLoading(false);
    }
  }, [staff, mode, customPassword, onClose]);

  const handleClose = useCallback(() => {
    setCustomPassword('');
    setMode('random');
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.modalBackdrop} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable
            style={[styles.modalSheet, { backgroundColor: currentTheme.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.modalTitle, { color: currentTheme.textPrimary }]}>
                Réinitialiser le mot de passe
              </Text>
              <Text style={[styles.modalMeta, { color: currentTheme.textSecondary }]}>
                Choisissez comment réinitialiser le mot de passe pour {staff?.username}.
              </Text>

              <View style={[styles.modalSection, { backgroundColor: currentTheme.surfaceMuted }]}>
                <Text style={[styles.modalSectionTitle, { color: currentTheme.textPrimary }]}>
                  Mode de réinitialisation
                </Text>
                <View style={[styles.segmented, { backgroundColor: currentTheme.surfaceMuted }]}>
                  <TouchableOpacity
                    style={[
                      styles.segment,
                      mode === 'random' && {
                        ...styles.segmentActive,
                        backgroundColor: currentTheme.pillActiveBg,
                      },
                      { flex: 1 },
                    ]}
                    onPress={() => setMode('random')}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color:
                            mode === 'random'
                              ? currentTheme.pillActiveText
                              : currentTheme.textSecondary,
                        },
                        mode === 'random' && styles.segmentTextActive,
                      ]}
                    >
                      Aléatoire
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segment,
                      mode === 'custom' && {
                        ...styles.segmentActive,
                        backgroundColor: currentTheme.pillActiveBg,
                      },
                      { flex: 1 },
                    ]}
                    onPress={() => setMode('custom')}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color:
                            mode === 'custom'
                              ? currentTheme.pillActiveText
                              : currentTheme.textSecondary,
                        },
                        mode === 'custom' && styles.segmentTextActive,
                      ]}
                    >
                      Personnalisé
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {mode === 'custom' && (
                <View style={[styles.modalSection, { backgroundColor: currentTheme.surfaceMuted }]}>
                  <Text style={[styles.modalSectionTitle, { color: currentTheme.textPrimary }]}>
                    Mot de passe personnalisé
                  </Text>
                  <TextInput
                    value={customPassword}
                    onChangeText={setCustomPassword}
                    placeholder="Entrez le nouveau mot de passe"
                    placeholderTextColor={currentTheme.textSecondary}
                    style={[
                      styles.searchInput,
                      {
                        backgroundColor: currentTheme.surface,
                        borderColor: currentTheme.border,
                        color: currentTheme.textPrimary,
                      },
                    ]}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.modalCloseButton,
                  { backgroundColor: currentTheme.pillActiveBg },
                  loading && { opacity: 0.6 },
                ]}
                onPress={handleConfirm}
                disabled={loading}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.pillActiveText }]}>
                  {loading ? 'Réinitialisation…' : 'Confirmer'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalCloseButton,
                  { backgroundColor: currentTheme.surfaceMuted, marginTop: 8 },
                ]}
                onPress={handleClose}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.textPrimary }]}>
                  Annuler
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}


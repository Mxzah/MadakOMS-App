import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../kitchen/constants';
import { styles } from '../styles';
import type { KitchenTheme } from '../../kitchen/types';

// Normalise le slug du restaurant pour l'utiliser dans l'email
const normalizeRestaurantSlug = (slug: string): string => {
  return slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
};

// Génère le domaine email basé sur le slug du restaurant
const getRestaurantEmailDomain = (restaurantSlug: string): string => {
  const normalized = normalizeRestaurantSlug(restaurantSlug);
  return `@madak-${normalized}.internal`;
};

type AddStaffModalProps = {
  visible: boolean;
  restaurantId: string;
  onClose: () => void;
  onSuccess: () => void;
  theme?: KitchenTheme;
  isDark?: boolean;
};

export function AddStaffModal({ visible, restaurantId, onClose, onSuccess, theme, isDark = false }: AddStaffModalProps) {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'cook' | 'delivery' | 'manager'>('cook');
  const [password, setPassword] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(null);

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

  // Récupérer le slug du restaurant pour afficher le bon format d'email
  useEffect(() => {
    if (visible && restaurantId) {
      supabase
        .from('restaurants')
        .select('slug')
        .eq('id', restaurantId)
        .single()
        .then(({ data, error }) => {
          if (!error && data?.slug) {
            setRestaurantSlug(data.slug);
          } else {
            setRestaurantSlug(null);
          }
        });
    }
  }, [visible, restaurantId]);

  const generateRandomPassword = useCallback(() => {
    const random = Math.random().toString(36).slice(-6);
    const password = `Madak${random}!`;
    setPassword(password);
  }, []);

  // Génère le domaine email à afficher
  const getEmailDomain = (): string => {
    if (restaurantSlug) {
      return getRestaurantEmailDomain(restaurantSlug);
    }
    return '@madak.internal'; // Fallback vers l'ancien format
  };

  const handleAddStaff = useCallback(async () => {
    if (!username.trim()) {
      Alert.alert('Nom requis', "Veuillez saisir un nom d'utilisateur.");
      return;
    }

    try {
      setSaving(true);
      const normalizedUsername = username.trim().toLowerCase().replace(/\s+/g, '');

      const bodyPayload: any = {
        action: 'add_staff',
        restaurantId,
        username: normalizedUsername,
        role,
      };
      
      const trimmedPassword = password?.trim() || '';
      if (trimmedPassword.length > 0) {
        bodyPayload.password = trimmedPassword;
      }

      const { data, error } = await supabase.functions.invoke('staff-admin', {
        body: bodyPayload,
      });

      if (error) {
        console.warn(error);
        Alert.alert('Erreur', "Impossible de créer l'employé. Vérifiez l'Edge Function.");
        return;
      }

      const newTempPassword = (data as any)?.tempPassword as string | undefined;
      if (newTempPassword) {
        setTempPassword(newTempPassword);
      } else {
        setTempPassword(null);
      }

      setUsername('');
      setPassword('');
      setRole('cook');
      onSuccess();
    } finally {
      setSaving(false);
    }
  }, [password, role, username, restaurantId, onSuccess]);

  const handleClose = useCallback(() => {
    setTempPassword(null);
    setPassword('');
    setUsername('');
    setRole('cook');
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
                Ajouter un membre
              </Text>
              <Text style={[styles.modalMeta, { color: currentTheme.textSecondary }]}>
                Un compte interne sera créé avec un courriel pseudo comme
                <Text style={{ fontWeight: '600', color: currentTheme.textPrimary }}>
                  {' '}nomutilisateur{getEmailDomain()}
                </Text>.
              </Text>

              <View style={[styles.modalSection, { backgroundColor: currentTheme.surfaceMuted }]}>
                <Text style={[styles.modalSectionTitle, { color: currentTheme.textPrimary }]}>
                  Nom d'utilisateur
                </Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="ex: chef-cuisine"
                  placeholderTextColor={currentTheme.textSecondary}
                  style={[
                    styles.searchInput,
                    {
                      backgroundColor: currentTheme.surface,
                      borderColor: currentTheme.border,
                      color: currentTheme.textPrimary,
                    },
                  ]}
                  autoCapitalize="none"
                />
              </View>

              <View style={[styles.modalSection, { backgroundColor: currentTheme.surfaceMuted }]}>
                <Text style={[styles.modalSectionTitle, { color: currentTheme.textPrimary }]}>
                  Rôle
                </Text>
                <View style={[styles.segmented, { backgroundColor: currentTheme.surfaceMuted }]}>
                  {(['cook', 'delivery', 'manager'] as const).map((r) => {
                    const isActive = role === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[
                          styles.segment,
                          isActive && {
                            ...styles.segmentActive,
                            backgroundColor: currentTheme.pillActiveBg,
                          },
                        ]}
                        onPress={() => setRole(r)}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            {
                              color: isActive ? currentTheme.pillActiveText : currentTheme.textSecondary,
                            },
                            isActive && styles.segmentTextActive,
                          ]}
                        >
                          {r === 'cook' ? 'Cuisine' : r === 'delivery' ? 'Livraison' : 'Gestion'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.modalSection, { backgroundColor: currentTheme.surfaceMuted }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[styles.modalSectionTitle, { color: currentTheme.textPrimary }]}>
                    Mot de passe
                  </Text>
                  <TouchableOpacity
                    onPress={generateRandomPassword}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      backgroundColor: currentTheme.pillActiveBg,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: currentTheme.pillActiveText, fontSize: 13, fontWeight: '600' }}>
                      Générer
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.modalSubText, { marginBottom: 8, color: currentTheme.textSecondary }]}>
                  Laissez vide pour générer automatiquement un mot de passe aléatoire.
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mot de passe (optionnel)"
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

              {tempPassword && (
                <View style={[styles.modalSection, { backgroundColor: currentTheme.surfaceMuted }]}>
                  <Text style={[styles.modalSectionTitle, { color: currentTheme.textPrimary }]}>
                    Mot de passe temporaire
                  </Text>
                  <Text style={[styles.modalText, { color: currentTheme.textPrimary }]}>
                    {tempPassword}
                  </Text>
                  <Text style={[styles.modalSubText, { color: currentTheme.textSecondary }]}>
                    Communiquez ce mot de passe au membre. Il pourra le modifier via Supabase si besoin.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.modalCloseButton,
                  { backgroundColor: currentTheme.pillActiveBg },
                  saving && { opacity: 0.6 },
                ]}
                onPress={handleAddStaff}
                disabled={saving}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.pillActiveText }]}>
                  {saving ? 'Création…' : "Créer l'employé"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalCloseButton,
                  { backgroundColor: currentTheme.surfaceMuted, marginTop: 8 },
                ]}
                onPress={handleClose}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.textPrimary }]}>Fermer</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}


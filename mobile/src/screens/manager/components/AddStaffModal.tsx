import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../kitchen/constants';
import { STAFF_EMAIL_DOMAIN } from '../constants';
import { styles } from '../styles';

type AddStaffModalProps = {
  visible: boolean;
  restaurantId: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function AddStaffModal({ visible, restaurantId, onClose, onSuccess }: AddStaffModalProps) {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'cook' | 'delivery' | 'manager'>('cook');
  const [password, setPassword] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const generateRandomPassword = useCallback(() => {
    const random = Math.random().toString(36).slice(-6);
    const password = `Madak${random}!`;
    setPassword(password);
  }, []);

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
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView 
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalTitle}>Ajouter un membre</Text>
              <Text style={styles.modalMeta}>
                Un compte interne sera créé avec un courriel pseudo comme
                <Text style={{ fontWeight: '600' }}> nomutilisateur{STAFF_EMAIL_DOMAIN}</Text>.
              </Text>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Nom d'utilisateur</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="ex: chef-cuisine"
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Rôle</Text>
                <View style={styles.segmented}>
                  {(['cook', 'delivery', 'manager'] as const).map((r) => {
                    const isActive = role === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[styles.segment, isActive && styles.segmentActive]}
                        onPress={() => setRole(r)}
                      >
                        <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                          {r === 'cook' ? 'Cuisine' : r === 'delivery' ? 'Livraison' : 'Gestion'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.modalSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.modalSectionTitle}>Mot de passe</Text>
                  <TouchableOpacity
                    onPress={generateRandomPassword}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      backgroundColor: colors.accent,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>Générer</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.modalSubText, { marginBottom: 8 }]}>
                  Laissez vide pour générer automatiquement un mot de passe aléatoire.
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mot de passe (optionnel)"
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              {tempPassword && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Mot de passe temporaire</Text>
                  <Text style={styles.modalText}>{tempPassword}</Text>
                  <Text style={styles.modalSubText}>
                    Communiquez ce mot de passe au membre. Il pourra le modifier via Supabase si besoin.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.modalCloseButton, saving && { opacity: 0.6 }]}
                onPress={handleAddStaff}
                disabled={saving}
              >
                <Text style={styles.modalCloseText}>
                  {saving ? 'Création…' : "Créer l'employé"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalCloseButton, { backgroundColor: '#E5E7EB', marginTop: 8 }]}
                onPress={handleClose}
              >
                <Text style={[styles.modalCloseText, { color: colors.dark }]}>Fermer</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}


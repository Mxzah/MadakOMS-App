import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../kitchen/constants';
import type { StaffUser, WorkSchedule } from '../types';
import { styles } from '../styles';
import type { KitchenTheme } from '../../kitchen/types';

type ScheduleModalProps = {
  visible: boolean;
  staff: StaffUser | null;
  onClose: () => void;
  onSuccess: () => void;
  theme?: KitchenTheme;
  isDark?: boolean;
};

export function ScheduleModal({ visible, staff, onClose, onSuccess, theme, isDark = false }: ScheduleModalProps) {
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [schedule, setSchedule] = useState<WorkSchedule>({});
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (visible && staff) {
      setScheduleEnabled(staff.workScheduleEnabled || false);
      
      const defaultSchedule: WorkSchedule = {
        monday: { enabled: false, start: '', end: '' },
        tuesday: { enabled: false, start: '', end: '' },
        wednesday: { enabled: false, start: '', end: '' },
        thursday: { enabled: false, start: '', end: '' },
        friday: { enabled: false, start: '', end: '' },
        saturday: { enabled: false, start: '', end: '' },
        sunday: { enabled: false, start: '', end: '' },
      };

      if (staff.workSchedule) {
        Object.keys(defaultSchedule).forEach((day) => {
          const dayData = staff.workSchedule?.[day];
          if (dayData) {
            if (typeof dayData.enabled === 'boolean') {
              defaultSchedule[day] = {
                enabled: dayData.enabled,
                start: dayData.start || '',
                end: dayData.end || '',
              };
            } else {
              const hasTimes = dayData.start && dayData.end && dayData.start !== null && dayData.end !== null;
              defaultSchedule[day] = {
                enabled: hasTimes,
                start: dayData.start || '',
                end: dayData.end || '',
              };
            }
          }
        });
      }
      
      setSchedule(defaultSchedule);
    } else if (!visible) {
      // Reset when modal closes
      setSchedule({});
      setScheduleEnabled(false);
    }
  }, [visible, staff]);

  const handleSave = useCallback(async () => {
    if (!staff) return;

    try {
      setSaving(true);
      const scheduleToSave: Record<string, { enabled: boolean; start: string | null; end: string | null }> = {};
      Object.keys(schedule).forEach((day) => {
        const dayData = schedule[day];
        const isDayEnabled = dayData.enabled === true;
        scheduleToSave[day] = {
          enabled: isDayEnabled,
          start: dayData.start || null,
          end: dayData.end || null,
        };
      });

      const { error } = await supabase
        .from('staff_users')
        .update({
          work_schedule_enabled: scheduleEnabled,
          work_schedule: scheduleToSave,
        })
        .eq('id', staff.id);

      if (error) {
        console.warn(error);
        Alert.alert('Erreur', 'Impossible de sauvegarder les horaires.');
        return;
      }

      onClose();
      Alert.alert('Succès', 'Les horaires ont été mis à jour.');
      onSuccess();
    } finally {
      setSaving(false);
    }
  }, [staff, scheduleEnabled, schedule, onClose, onSuccess]);

  const dayLabels: Record<string, string> = {
    monday: 'Lundi',
    tuesday: 'Mardi',
    wednesday: 'Mercredi',
    thursday: 'Jeudi',
    friday: 'Vendredi',
    saturday: 'Samedi',
    sunday: 'Dimanche',
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
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
                Horaires de travail
              </Text>
              <Text style={[styles.modalMeta, { color: currentTheme.textSecondary }]}>
                Configurez les horaires de travail pour {staff?.username}.
              </Text>

              <View style={[styles.modalSection, { backgroundColor: currentTheme.surfaceMuted }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.modalSectionTitle, { color: currentTheme.textPrimary }]}>
                    Activer les horaires
                  </Text>
                  <TouchableOpacity
                    onPress={() => setScheduleEnabled(!scheduleEnabled)}
                    style={{
                      width: 50,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: scheduleEnabled
                        ? currentTheme.pillActiveBg
                        : isDark
                        ? '#374151'
                        : '#E5E7EB',
                      justifyContent: 'center',
                      paddingHorizontal: 2,
                    }}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: '#FFFFFF',
                        alignSelf: scheduleEnabled ? 'flex-end' : 'flex-start',
                      }}
                    />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.modalSubText, { marginTop: 8, color: currentTheme.textSecondary }]}>
                  Si activé, l'employé ne pourra se connecter que pendant ses heures de travail.
                </Text>
              </View>

              {scheduleEnabled && (
                <View style={[styles.modalSection, { backgroundColor: currentTheme.surfaceMuted }]}>
                  <Text style={[styles.modalSectionTitle, { color: currentTheme.textPrimary }]}>
                    Horaires par jour
                  </Text>
                  {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map((day) => {
                    const daySchedule = schedule[day] || { enabled: false, start: '', end: '' };
                    const isEnabled = Boolean(schedule[day]?.enabled);

                    return (
                      <View
                        key={day}
                        style={{
                          marginBottom: 16,
                          paddingBottom: 16,
                          borderBottomWidth: 1,
                          borderBottomColor: currentTheme.border,
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <Text style={[styles.modalSectionTitle, { fontSize: 14, color: currentTheme.textPrimary }]}>
                            {dayLabels[day]}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              const currentState = schedule[day];
                              const currentEnabled = Boolean(currentState?.enabled);
                              const newEnabled = !currentEnabled;
                              setSchedule({
                                ...schedule,
                                [day]: {
                                  enabled: newEnabled,
                                  start: newEnabled ? (currentState?.start || '09:00') : (currentState?.start || ''),
                                  end: newEnabled ? (currentState?.end || '17:00') : (currentState?.end || ''),
                                },
                              });
                            }}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 6,
                              backgroundColor: isEnabled ? '#DCFCE7' : '#FEE2E2',
                              borderRadius: 8,
                            }}
                          >
                            <Text style={{ color: isEnabled ? '#15803D' : '#B91C1C', fontSize: 12, fontWeight: '600' }}>
                              {isEnabled ? 'Activer' : 'Désactiver'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        {isEnabled && (
                          <View style={{ flexDirection: 'row', gap: 12 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.modalSubText, { marginBottom: 4, color: currentTheme.textSecondary }]}>
                                Début
                              </Text>
                              <TextInput
                                value={daySchedule.start}
                                onChangeText={(text) => {
                                  setSchedule({
                                    ...schedule,
                                    [day]: { ...daySchedule, start: text },
                                  });
                                }}
                                placeholder="09:00"
                                placeholderTextColor={currentTheme.textSecondary}
                                style={[
                                  styles.searchInput,
                                  {
                                    backgroundColor: currentTheme.surface,
                                    borderColor: currentTheme.border,
                                    color: currentTheme.textPrimary,
                                  },
                                ]}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.modalSubText, { marginBottom: 4, color: currentTheme.textSecondary }]}>
                                Fin
                              </Text>
                              <TextInput
                                value={daySchedule.end}
                                onChangeText={(text) => {
                                  setSchedule({
                                    ...schedule,
                                    [day]: { ...daySchedule, end: text },
                                  });
                                }}
                                placeholder="17:00"
                                placeholderTextColor={currentTheme.textSecondary}
                                style={[
                                  styles.searchInput,
                                  {
                                    backgroundColor: currentTheme.surface,
                                    borderColor: currentTheme.border,
                                    color: currentTheme.textPrimary,
                                  },
                                ]}
                              />
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.modalCloseButton,
                  { backgroundColor: currentTheme.pillActiveBg },
                  saving && { opacity: 0.6 },
                ]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.pillActiveText }]}>
                  {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalCloseButton,
                  { backgroundColor: currentTheme.surfaceMuted, marginTop: 8 },
                ]}
                onPress={() => {
                  setSchedule({});
                  onClose();
                }}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.textPrimary }]}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}


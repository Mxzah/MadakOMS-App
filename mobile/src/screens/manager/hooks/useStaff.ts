import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../../../lib/supabase';
import type { StaffUser, WorkSchedule } from '../types';

export function useStaff(restaurantId: string) {
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);

  const fetchStaffUsers = useCallback(async () => {
    try {
      setStaffLoading(true);
      const { data, error } = await supabase
        .from('staff_users')
        .select('id, username, role, is_active, auth_user_id, work_schedule_enabled, work_schedule')
        .eq('restaurant_id', restaurantId)
        .order('username', { ascending: true });

      if (error) {
        console.warn(error);
        return;
      }

      setStaffUsers(
        (data ?? []).map((row: any) => ({
          id: row.id,
          username: row.username,
          role: row.role,
          isActive: row.is_active,
          authUserId: row.auth_user_id,
          workScheduleEnabled: row.work_schedule_enabled || false,
          workSchedule: row.work_schedule || null,
        })),
      );
    } finally {
      setStaffLoading(false);
    }
  }, [restaurantId]);

  const ensureStaffSelected = useCallback(() => {
    if (!selectedStaff) {
      Alert.alert('Sélection requise', 'Sélectionnez un employé dans la liste.');
      return false;
    }
    return true;
  }, [selectedStaff]);

  const handleToggleActive = useCallback(async () => {
    if (!ensureStaffSelected()) return;
    if (!selectedStaff) return;

    const targetState = !selectedStaff.isActive;
    Alert.alert(
      targetState ? 'Activer le compte' : 'Désactiver le compte',
      targetState
        ? `Autoriser ${selectedStaff.username} à se connecter ?`
        : `Empêcher ${selectedStaff.username} de se connecter ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.functions.invoke('staff-admin', {
                body: {
                  action: 'toggle_active',
                  staffId: selectedStaff.id,
                  isActive: targetState,
                },
              });

              if (error) {
                console.warn(error);
                Alert.alert('Erreur', 'Impossible de mettre à jour le compte.');
                return;
              }

              await fetchStaffUsers();
              setSelectedStaff((prev) => (prev ? { ...prev, isActive: targetState } : null));

              Alert.alert(
                'Succès',
                targetState
                  ? `${selectedStaff.username} peut maintenant se connecter.`
                  : `${selectedStaff.username} ne peut plus se connecter.`,
                [{ text: 'OK' }],
              );
            } catch (err) {
              console.warn(err);
            }
          },
        },
      ],
    );
  }, [selectedStaff, ensureStaffSelected, fetchStaffUsers]);

  return {
    staffUsers,
    staffLoading,
    selectedStaff,
    setSelectedStaff,
    fetchStaffUsers,
    ensureStaffSelected,
    handleToggleActive,
  };
}


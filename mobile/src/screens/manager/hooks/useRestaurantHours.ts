import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../../../lib/supabase';

// Fonction helper pour normaliser les données d'un jour (convertit start/end en open/close si nécessaire)
function normalizeDayHours(dayData: any): DayHours {
  if (!dayData) {
    return { enabled: false, open: null, close: null };
  }

  // Utiliser open/close en priorité, sinon convertir start/end en open/close
  const open = dayData.open !== undefined ? dayData.open : (dayData.start || null);
  const close = dayData.close !== undefined ? dayData.close : (dayData.end || null);
  const enabled = dayData.enabled !== undefined ? dayData.enabled : (open !== null && close !== null);

  return {
    enabled,
    open,
    close,
  };
}

export type DayHours = {
  enabled: boolean;
  open: string | null; // HH:MM format (ouverture)
  close: string | null; // HH:MM format (fermeture)
};

export type RestaurantHours = {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
};

const defaultHours: RestaurantHours = {
  monday: { enabled: true, open: '09:00', close: '17:00' },
  tuesday: { enabled: true, open: '09:00', close: '17:00' },
  wednesday: { enabled: true, open: '09:00', close: '17:00' },
  thursday: { enabled: true, open: '09:00', close: '17:00' },
  friday: { enabled: true, open: '09:00', close: '17:00' },
  saturday: { enabled: true, open: '09:00', close: '17:00' },
  sunday: { enabled: false, open: null, close: null },
};

export function useRestaurantHours(restaurantId: string) {
  const [restaurantHours, setRestaurantHours] = useState<RestaurantHours>(defaultHours);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchRestaurantHours = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('restaurant_settings')
        .select('hours_json')
        .eq('restaurant_id', restaurantId)
        .single();

      if (error) {
        console.warn(error);
        return;
      }

      if (data?.hours_json) {
        const rawHours = data.hours_json as any;
        // Normaliser les données : convertir start/end en open/close si nécessaire
        const normalizedHours: RestaurantHours = {
          monday: normalizeDayHours(rawHours.monday),
          tuesday: normalizeDayHours(rawHours.tuesday),
          wednesday: normalizeDayHours(rawHours.wednesday),
          thursday: normalizeDayHours(rawHours.thursday),
          friday: normalizeDayHours(rawHours.friday),
          saturday: normalizeDayHours(rawHours.saturday),
          sunday: normalizeDayHours(rawHours.sunday),
        };
        setRestaurantHours(normalizedHours);
      } else {
        setRestaurantHours(defaultHours);
      }
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchRestaurantHours();
  }, [fetchRestaurantHours]);

  const saveRestaurantHours = useCallback(async (hours: RestaurantHours) => {
    try {
      setSaving(true);

      // Nettoyer les données : s'assurer qu'on sauvegarde seulement open/close (pas start/end)
      const cleanedHours: any = {};
      Object.keys(hours).forEach((day) => {
        const dayHours = hours[day as keyof RestaurantHours];
        cleanedHours[day] = {
          enabled: dayHours.enabled,
          open: dayHours.open,
          close: dayHours.close,
        };
      });

      const { error } = await supabase
        .from('restaurant_settings')
        .upsert({
          restaurant_id: restaurantId,
          hours_json: cleanedHours,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'restaurant_id',
        });

      if (error) {
        console.warn(error);
        Alert.alert('Erreur', 'Impossible de sauvegarder les horaires.');
        return false;
      }

      setRestaurantHours(hours);
      Alert.alert('Succès', 'Les horaires ont été mis à jour.');
      return true;
    } finally {
      setSaving(false);
    }
  }, [restaurantId]);

  return {
    restaurantHours,
    loading,
    saving,
    setRestaurantHours,
    saveRestaurantHours,
    refetch: fetchRestaurantHours,
  };
}


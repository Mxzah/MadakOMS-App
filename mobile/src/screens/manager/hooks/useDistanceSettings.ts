import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../../../lib/supabase';

export type DistanceSettings = {
  distanceCalculationEnabled: boolean;
  distanceMatrixApiKey: string | null;
};

export function useDistanceSettings(restaurantId: string) {
  const [distanceSettings, setDistanceSettings] = useState<DistanceSettings>({
    distanceCalculationEnabled: false,
    distanceMatrixApiKey: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch distance settings from Supabase
  useEffect(() => {
    const fetchDistanceSettings = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('restaurant_settings')
          .select('distance_time_calculation_enabled, distance_matrix_api_key')
          .eq('restaurant_id', restaurantId)
          .maybeSingle();

        if (error) {
          console.warn('Erreur lors de la récupération des paramètres de distance:', error);
        } else if (data) {
          setDistanceSettings({
            distanceCalculationEnabled: data.distance_time_calculation_enabled ?? false,
            distanceMatrixApiKey: data.distance_matrix_api_key ?? null,
          });
        }
      } catch (err) {
        console.warn('Erreur lors de la récupération des paramètres de distance:', err);
      } finally {
        setLoading(false);
      }
    };

    if (restaurantId) {
      fetchDistanceSettings();
    }
  }, [restaurantId]);

  // Save distance settings to Supabase
  const saveDistanceSettings = async (settings: DistanceSettings): Promise<boolean> => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('restaurant_settings')
        .update({
          distance_time_calculation_enabled: settings.distanceCalculationEnabled,
          distance_matrix_api_key: settings.distanceMatrixApiKey,
        })
        .eq('restaurant_id', restaurantId);

      if (error) {
        console.error('Erreur lors de la sauvegarde des paramètres de distance:', error);
        Alert.alert('Erreur', 'Impossible de sauvegarder les paramètres de distance.');
        return false;
      }

      setDistanceSettings(settings);
      Alert.alert('Succès', 'Paramètres de distance sauvegardés avec succès.');
      return true;
    } catch (err) {
      console.error('Erreur lors de la sauvegarde des paramètres de distance:', err);
      Alert.alert('Erreur', 'Impossible de sauvegarder les paramètres de distance.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    distanceSettings,
    loading,
    saving,
    setDistanceSettings,
    saveDistanceSettings,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../../../lib/supabase';

export type DeliveryZonesData = {
  deliveryRadiusKm: number | null;
  deliveryZonesGeoJson: any | null;
};

export function useDeliveryZones(restaurantId: string) {
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZonesData>({
    deliveryRadiusKm: null,
    deliveryZonesGeoJson: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchDeliveryZones = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('restaurant_settings')
        .select('delivery_radius_km, delivery_zones_geojson')
        .eq('restaurant_id', restaurantId)
        .single();

      if (error) {
        console.warn(error);
        return;
      }

      setDeliveryZones({
        deliveryRadiusKm: data?.delivery_radius_km || null,
        deliveryZonesGeoJson: data?.delivery_zones_geojson || null,
      });
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchDeliveryZones();
  }, [fetchDeliveryZones]);

  const saveDeliveryZones = useCallback(async (zones: DeliveryZonesData) => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('restaurant_settings')
        .upsert({
          restaurant_id: restaurantId,
          delivery_radius_km: zones.deliveryRadiusKm || null,
          delivery_zones_geojson: zones.deliveryZonesGeoJson || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'restaurant_id',
        });

      if (error) {
        console.warn(error);
        Alert.alert('Erreur', 'Impossible de sauvegarder les zones de livraison.');
        return false;
      }

      setDeliveryZones(zones);
      Alert.alert('Succès', 'Les zones de livraison ont été mises à jour.');
      return true;
    } finally {
      setSaving(false);
    }
  }, [restaurantId]);

  return {
    deliveryZones,
    loading,
    saving,
    setDeliveryZones,
    saveDeliveryZones,
    refetch: fetchDeliveryZones,
  };
}


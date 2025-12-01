import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../../../lib/supabase';

export type PeakHour = {
  start: string; // HH:MM format
  end: string; // HH:MM format
  additionalFee: number;
};

export type MinimumOrderSurcharge = {
  threshold: number;
  surcharge: number;
};

export type DeliveryFeeRules = {
  type: 'flat' | 'distance_based';
  baseFee: number;
  perKmFee: number | null;
  maxDistanceKm: number | null;
  freeDeliveryAbove: number | null;
  peakHours: PeakHour[] | null;
  weekendFee: number | null;
  holidayFee: number | null;
  minimumOrderSurcharge: MinimumOrderSurcharge | null;
};

export function useDeliveryFeeRules(restaurantId: string) {
  const [deliveryFeeRules, setDeliveryFeeRules] = useState<DeliveryFeeRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchDeliveryFeeRules = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('restaurant_settings')
        .select('delivery_fee_rules')
        .eq('restaurant_id', restaurantId)
        .single();

      if (error) {
        console.warn(error);
        return;
      }

      if (data?.delivery_fee_rules) {
        setDeliveryFeeRules(data.delivery_fee_rules as DeliveryFeeRules);
      } else {
        // Default structure
        setDeliveryFeeRules({
          type: 'flat',
          baseFee: 0,
          perKmFee: null,
          maxDistanceKm: null,
          freeDeliveryAbove: null,
          peakHours: null,
          weekendFee: null,
          holidayFee: null,
          minimumOrderSurcharge: null,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchDeliveryFeeRules();
  }, [fetchDeliveryFeeRules]);

  const saveDeliveryFeeRules = useCallback(async (rules: DeliveryFeeRules) => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('restaurant_settings')
        .upsert({
          restaurant_id: restaurantId,
          delivery_fee_rules: rules,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'restaurant_id',
        });

      if (error) {
        console.warn(error);
        Alert.alert('Erreur', 'Impossible de sauvegarder les règles de frais de livraison.');
        return false;
      }

      setDeliveryFeeRules(rules);
      Alert.alert('Succès', 'Les règles de frais de livraison ont été mises à jour.');
      return true;
    } finally {
      setSaving(false);
    }
  }, [restaurantId]);

  return {
    deliveryFeeRules,
    loading,
    saving,
    setDeliveryFeeRules,
    saveDeliveryFeeRules,
    refetch: fetchDeliveryFeeRules,
  };
}


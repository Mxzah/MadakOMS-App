import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../../../lib/supabase';

export type PaymentMethod = 'cash' | 'card_terminal' | 'card_online';

export type PaymentSettings = {
  pickup: PaymentMethod[];
  delivery: PaymentMethod[];
};

export function usePaymentSettings(restaurantId: string) {
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({
    pickup: ['card_online', 'card_terminal', 'cash'],
    delivery: ['card_online', 'card_terminal', 'cash'],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPaymentSettings = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('restaurant_settings')
        .select('payment_options_by_service')
        .eq('restaurant_id', restaurantId)
        .single();

      if (error) {
        console.warn(error);
        return;
      }

      if (data?.payment_options_by_service) {
        setPaymentSettings({
          pickup: data.payment_options_by_service.pickup || ['card_online', 'card_terminal', 'cash'],
          delivery: data.payment_options_by_service.delivery || ['card_online', 'card_terminal', 'cash'],
        });
      }
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchPaymentSettings();
  }, [fetchPaymentSettings]);

  const savePaymentSettings = useCallback(async (settings: PaymentSettings) => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('restaurant_settings')
        .upsert({
          restaurant_id: restaurantId,
          payment_options_by_service: settings,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'restaurant_id',
        });

      if (error) {
        console.warn(error);
        Alert.alert('Erreur', 'Impossible de sauvegarder les paramètres de paiement.');
        return false;
      }

      setPaymentSettings(settings);
      Alert.alert('Succès', 'Les paramètres de paiement ont été mis à jour.');
      return true;
    } finally {
      setSaving(false);
    }
  }, [restaurantId]);

  return {
    paymentSettings,
    loading,
    saving,
    setPaymentSettings,
    savePaymentSettings,
    refetch: fetchPaymentSettings,
  };
}


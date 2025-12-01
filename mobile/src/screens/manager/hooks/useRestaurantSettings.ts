import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../../../lib/supabase';
import type { OrderingSettings, RestaurantInfo } from '../types';

export function useRestaurantSettings(restaurantId: string) {
  const [restaurantInfo, setRestaurantInfo] = useState<RestaurantInfo>({
    name: '',
    phone: null,
    email: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    province: null,
    postalCode: null,
    country: null,
  });
  const [orderingSettings, setOrderingSettings] = useState<OrderingSettings>({
    orderingEnabled: true,
    pickupEnabled: true,
    deliveryEnabled: true,
    minOrderAmountPickup: null,
    minOrderAmountDelivery: null,
    estimatedPrepTimeMinutes: 20,
    estimatedDeliveryTimeMinutes: 30,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch restaurant info
      const { data: restaurant, error: restaurantError } = await supabase
        .from('restaurants')
        .select('name, phone, email')
        .eq('id', restaurantId)
        .single();

      if (restaurantError) {
        console.warn(restaurantError);
        return;
      }

      // Fetch restaurant settings
      const { data: settings, error: settingsError } = await supabase
        .from('restaurant_settings')
        .select('address_line1, address_line2, city, province, postal_code, country, ordering_enabled, pickup_enabled, delivery_enabled, min_order_amount_pickup, min_order_amount_delivery, estimated_prep_time_minutes, estimated_delivery_time_minutes')
        .eq('restaurant_id', restaurantId)
        .single();

      if (settingsError) {
        console.warn(settingsError);
        return;
      }

      setRestaurantInfo({
        name: restaurant?.name || '',
        phone: restaurant?.phone || null,
        email: restaurant?.email || null,
        addressLine1: settings?.address_line1 || null,
        addressLine2: settings?.address_line2 || null,
        city: settings?.city || null,
        province: settings?.province || null,
        postalCode: settings?.postal_code || null,
        country: settings?.country || null,
      });

      setOrderingSettings({
        orderingEnabled: settings?.ordering_enabled ?? true,
        pickupEnabled: settings?.pickup_enabled ?? true,
        deliveryEnabled: settings?.delivery_enabled ?? true,
        minOrderAmountPickup: settings?.min_order_amount_pickup || null,
        minOrderAmountDelivery: settings?.min_order_amount_delivery || null,
        estimatedPrepTimeMinutes: settings?.estimated_prep_time_minutes || 20,
        estimatedDeliveryTimeMinutes: settings?.estimated_delivery_time_minutes || 30,
      });
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveRestaurantInfo = useCallback(async (info: RestaurantInfo) => {
    try {
      setSaving(true);

      // Update restaurant
      const { error: restaurantError } = await supabase
        .from('restaurants')
        .update({
          name: info.name,
          phone: info.phone || null,
          email: info.email || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', restaurantId);

      if (restaurantError) {
        console.warn(restaurantError);
        Alert.alert('Erreur', 'Impossible de mettre à jour les informations du restaurant.');
        return false;
      }

      // Update restaurant settings (address)
      const { error: settingsError } = await supabase
        .from('restaurant_settings')
        .upsert({
          restaurant_id: restaurantId,
          address_line1: info.addressLine1 || null,
          address_line2: info.addressLine2 || null,
          city: info.city || null,
          province: info.province || null,
          postal_code: info.postalCode || null,
          country: info.country || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'restaurant_id',
        });

      if (settingsError) {
        console.warn(settingsError);
        Alert.alert('Erreur', 'Impossible de mettre à jour l\'adresse.');
        return false;
      }

      setRestaurantInfo(info);
      Alert.alert('Succès', 'Les informations du restaurant ont été mises à jour.');
      return true;
    } finally {
      setSaving(false);
    }
  }, [restaurantId]);

  const saveOrderingSettings = useCallback(async (settings: OrderingSettings) => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('restaurant_settings')
        .upsert({
          restaurant_id: restaurantId,
          ordering_enabled: settings.orderingEnabled,
          pickup_enabled: settings.pickupEnabled,
          delivery_enabled: settings.deliveryEnabled,
          min_order_amount_pickup: settings.minOrderAmountPickup || null,
          min_order_amount_delivery: settings.minOrderAmountDelivery || null,
          estimated_prep_time_minutes: settings.estimatedPrepTimeMinutes || null,
          estimated_delivery_time_minutes: settings.estimatedDeliveryTimeMinutes || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'restaurant_id',
        });

      if (error) {
        console.warn(error);
        Alert.alert('Erreur', 'Impossible de mettre à jour les paramètres de commande.');
        return false;
      }

      setOrderingSettings(settings);
      Alert.alert('Succès', 'Les paramètres de commande ont été mis à jour.');
      return true;
    } finally {
      setSaving(false);
    }
  }, [restaurantId]);

  return {
    restaurantInfo,
    orderingSettings,
    loading,
    saving,
    setRestaurantInfo,
    setOrderingSettings,
    saveRestaurantInfo,
    saveOrderingSettings,
    refetch: fetchSettings,
  };
}


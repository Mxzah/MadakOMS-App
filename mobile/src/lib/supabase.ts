import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

type ExtraConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  restaurantId?: string | null;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

if (!extra.supabaseUrl || !extra.supabaseAnonKey) {
  throw new Error(
    'Missing Supabase credentials. Update expo.extra.supabaseUrl and supabaseAnonKey in app.json.'
  );
}

// Export the configured restaurant ID for authentication checks
export const configuredRestaurantId: string | null = extra.restaurantId || null;

export const supabase = createClient(extra.supabaseUrl, extra.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});


import type { KitchenTheme } from './types';

export const NOTIFICATION_SOUND_URL =
  'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

export const colors = {
  background: '#F5F6FB',
  surface: '#FFFFFF',
  dark: '#1B1C1F',
  muted: '#6B7280',
  border: '#E5E7EB',
  accent: '#2563EB',
  danger: '#DC2626',
};

export const kitchenThemes: Record<'light' | 'dark', KitchenTheme> = {
  light: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceMuted: '#F6F7FB',
    textPrimary: colors.dark,
    textSecondary: colors.muted,
    border: colors.border,
    pillActiveBg: colors.accent,
    pillActiveText: '#FFFFFF',
  },
  dark: {
    background: '#0B1120',
    surface: '#111827',
    surfaceMuted: '#1F2A3E',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    border: '#1F2A3E',
    pillActiveBg: colors.accent,
    pillActiveText: '#FFFFFF',
  },
};

export const ORDER_FILTERS = [
  { id: 'received', label: 'Nouvelles' },
  { id: 'preparing', label: 'En préparation' },
  { id: 'ready', label: 'Prêtes' },
] as const;


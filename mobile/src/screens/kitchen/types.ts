export type KitchenTheme = {
  background: string;
  surface: string;
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  pillActiveBg: string;
  pillActiveText: string;
};

export type SettingsState = {
  soundEnabled: boolean;
  theme: 'light' | 'dark';
};


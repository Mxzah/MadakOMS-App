import { Dispatch, SetStateAction } from 'react';
import { ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import type { KitchenTheme, SettingsState } from './types';
import { styles } from './styles';

type SettingsTabProps = {
  settings: SettingsState;
  onChangeSettings: Dispatch<SetStateAction<SettingsState>>;
  onLogout: () => void;
  theme: KitchenTheme;
};

export function SettingsTab({ settings, onChangeSettings, onLogout, theme }: SettingsTabProps) {
  const toggleSound = (value: boolean) => {
    onChangeSettings((prev) => ({ ...prev, soundEnabled: value }));
  };

  const toggleTheme = () => {
    onChangeSettings((prev) => ({ ...prev, theme: prev.theme === 'light' ? 'dark' : 'light' }));
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scrollBody}>
      <View style={[styles.settingCard, { backgroundColor: theme.surface }]}>
        <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>Notifications sonores</Text>
        <Text style={[styles.settingSubtitle, { color: theme.textSecondary }]}>
          Jouer un son à l’arrivée d’une commande
        </Text>
        <Switch value={settings.soundEnabled} onValueChange={toggleSound} />
      </View>

      <View style={[styles.settingCard, { backgroundColor: theme.surface }]}>
        <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>Mode sombre</Text>
        <Text style={[styles.settingSubtitle, { color: theme.textSecondary }]}>
          Basculer entre clair et sombre
        </Text>
        <Switch value={settings.theme === 'dark'} onValueChange={toggleTheme} />
      </View>

      <View style={[styles.settingCard, { backgroundColor: theme.surface }]}>
        <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>Version</Text>
        <Text style={[styles.settingSubtitle, { color: theme.textSecondary }]}>1.0.0</Text>
      </View>

      <TouchableOpacity style={styles.logoutCard} onPress={onLogout}>
        <Text style={styles.logoutText}>Déconnexion</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}


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

const KITCHEN_MODES = [
  {
    id: 'team',
    label: 'Équipe',
    description: 'Dans "En préparation" et "Historique", vous voyez toutes les commandes de tous les cuisiniers.',
  },
  {
    id: 'individual',
    label: 'Individuel',
    description: 'Dans "En préparation" et "Historique", vous voyez seulement les commandes qui vous sont assignées.',
  },
  {
    id: 'chef',
    label: 'Chef',
    description:
      'Dans "Nouvelles" vous pouvez assigner les commandes aux cuisiniers. Dans "En préparation" et "Historique", vous voyez toutes les commandes.',
  },
] as const;

export function SettingsTab({ settings, onChangeSettings, onLogout, theme }: SettingsTabProps) {
  const toggleSound = (value: boolean) => {
    onChangeSettings((prev) => ({ ...prev, soundEnabled: value }));
  };

  const toggleTheme = () => {
    onChangeSettings((prev) => ({ ...prev, theme: prev.theme === 'light' ? 'dark' : 'light' }));
  };

  const selectKitchenMode = (mode: 'team' | 'individual' | 'chef') => {
    onChangeSettings((prev) => ({ ...prev, kitchenMode: mode }));
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scrollBody}>
      <View style={[styles.settingCard, { backgroundColor: theme.surface }]}>
        <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>Mode de cuisine</Text>
        <Text style={[styles.settingSubtitle, { color: theme.textSecondary, marginBottom: 16 }]}>
          Choisissez votre mode de travail
        </Text>
        <View style={styles.modeSelector}>
          {KITCHEN_MODES.map((mode) => {
            const isActive = settings.kitchenMode === mode.id;
            return (
              <TouchableOpacity
                key={mode.id}
                style={[
                  styles.modeOption,
                  {
                    backgroundColor: isActive ? theme.pillActiveBg : theme.surfaceMuted,
                    borderColor: isActive ? theme.pillActiveBg : theme.border,
                  },
                ]}
                onPress={() => selectKitchenMode(mode.id)}
              >
                <Text
                  style={[
                    styles.modeOptionLabel,
                    {
                      color: isActive ? theme.pillActiveText : theme.textPrimary,
                    },
                  ]}
                >
                  {mode.label}
                </Text>
                <Text
                  style={[
                    styles.modeOptionDescription,
                    {
                      color: isActive ? theme.pillActiveText : theme.textSecondary,
                    },
                  ]}
                >
                  {mode.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={[styles.settingCard, { backgroundColor: theme.surface }]}>
        <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>Notifications sonores</Text>
        <Text style={[styles.settingSubtitle, { color: theme.textSecondary }]}>
          Jouer un son à l'arrivée d'une commande
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


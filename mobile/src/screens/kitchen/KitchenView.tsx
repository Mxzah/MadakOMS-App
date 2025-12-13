import { useState } from 'react';
import { TouchableOpacity, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OrdersTab } from './OrdersTab';
import { HistoryTab } from './HistoryTab';
import { SettingsTab } from './SettingsTab';
import { kitchenThemes } from './constants';
import type { SettingsState } from './types';
import { styles } from './styles';

type KitchenViewProps = {
  staff: {
    restaurantId: string;
    restaurantName: string;
    role: string;
    staffUserId: string;
  };
  onLogout: () => void;
};

// Fonction pour traduire les rôles en français
const translateRole = (role: string): string => {
  const roleTranslations: Record<string, string> = {
    cook: 'Cuisinier',
    chef: 'Chef',
    manager: 'Gestionnaire',
    driver: 'Livreur',
    coordinator: 'Coordinateur',
    admin: 'Administrateur',
  };
  
  return roleTranslations[role.toLowerCase()] || role;
};

export function KitchenView({ staff, onLogout }: KitchenViewProps) {
  const [activeTab, setActiveTab] = useState<'orders' | 'history' | 'settings'>('orders');
  const [settings, setSettings] = useState<SettingsState>({
    soundEnabled: true,
    theme: 'light',
    kitchenMode: 'team',
  });

  const theme = kitchenThemes[settings.theme];
  const isDark = settings.theme === 'dark';

  return (
    <SafeAreaView
      style={[styles.kitchenSafeArea, { backgroundColor: theme.background }]}
      edges={['top', 'left', 'right']}
    >
      <View style={styles.kitchenHeader}>
        <Text style={[styles.kitchenTitle, { color: theme.textPrimary }]}>Cuisine — MadakOMS</Text>
        <Text style={[styles.kitchenSubtitle, { color: theme.textSecondary }]}>
          Rôle: {translateRole(staff.role)}
        </Text>
        <Text style={[styles.kitchenSubtitle, { color: theme.textSecondary }]}>
          {staff.restaurantName}
        </Text>
      </View>

      <View style={[styles.kitchenTabBar, { backgroundColor: theme.surfaceMuted }]}>
        {(['orders', 'history', 'settings'] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.kitchenTabButton,
                { backgroundColor: isActive ? theme.pillActiveBg : 'transparent' },
                isActive && styles.kitchenTabButtonActive,
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.kitchenTabLabel,
                  { color: isActive ? theme.pillActiveText : theme.textSecondary },
                ]}
              >
                {tab === 'orders' ? 'Commandes' : tab === 'history' ? 'Historique' : 'Réglages'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.kitchenContent}>
        {activeTab === 'orders' ? (
          <OrdersTab
            restaurantId={staff.restaurantId}
            theme={theme}
            isDark={isDark}
            notificationsEnabled={settings.soundEnabled}
            staffRole={staff.role}
            staffUserId={staff.staffUserId}
            kitchenMode={settings.kitchenMode}
          />
        ) : activeTab === 'history' ? (
          <HistoryTab
            restaurantId={staff.restaurantId}
            theme={theme}
            isDark={isDark}
            kitchenMode={settings.kitchenMode}
            staffUserId={staff.staffUserId}
          />
        ) : (
          <SettingsTab
            settings={settings}
            onChangeSettings={setSettings}
            onLogout={onLogout}
            theme={theme}
          />
        )}
      </View>
    </SafeAreaView>
  );
}


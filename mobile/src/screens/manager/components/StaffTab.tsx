import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { KitchenOrder } from '../../../types/orders';
import { colors } from '../../kitchen/constants';
import type { StaffUser } from '../types';
import { styles } from '../styles';
import type { KitchenTheme } from '../../kitchen/types';

type StaffTabProps = {
  staffUsers: StaffUser[];
  staffLoading: boolean;
  selectedStaff: StaffUser | null;
  orders: KitchenOrder[];
  onSelectStaff: (staff: StaffUser) => void;
  onAddStaff: () => void;
  onResetPassword: () => void;
  onToggleActive: () => void;
  onOpenSchedule: () => void;
  theme?: KitchenTheme;
  isDark?: boolean;
};

export function StaffTab({
  staffUsers,
  staffLoading,
  selectedStaff,
  orders,
  onSelectStaff,
  onAddStaff,
  onResetPassword,
  onToggleActive,
  onOpenSchedule,
  theme,
  isDark = false,
}: StaffTabProps) {
  // Utiliser le thème par défaut si non fourni
  const currentTheme = theme || {
    background: colors.background,
    surface: colors.surface,
    surfaceMuted: '#F6F7FB',
    textPrimary: colors.dark,
    textSecondary: colors.muted,
    border: colors.border,
    pillActiveBg: colors.accent,
    pillActiveText: '#FFFFFF',
  };

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: currentTheme.background }]}
      contentContainerStyle={styles.staffContent}
    >
      <View style={styles.staffHeaderRow}>
        <Text style={[styles.sectionTitle, { color: currentTheme.textPrimary }]}>Équipe</Text>
      </View>
      <View style={styles.staffActionsRow}>
        <TouchableOpacity
          style={[
            styles.staffActionButton,
            {
              borderColor: currentTheme.border,
              backgroundColor: currentTheme.surface,
            },
          ]}
          onPress={onAddStaff}
        >
          <Text style={[styles.staffActionText, { color: currentTheme.textPrimary }]}>Ajouter</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.staffActionButton,
            {
              borderColor: currentTheme.border,
              backgroundColor: currentTheme.surface,
            },
          ]}
          onPress={onResetPassword}
        >
          <Text style={[styles.staffActionText, { color: currentTheme.textPrimary }]}>
            Réinit. mot de passe
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.staffActionButton,
            {
              borderColor: currentTheme.border,
              backgroundColor: currentTheme.surface,
            },
          ]}
          onPress={onToggleActive}
        >
          <Text style={[styles.staffActionText, { color: currentTheme.textPrimary }]}>
            Activer / désactiver
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.staffActionButton,
            {
              borderColor: currentTheme.border,
              backgroundColor: currentTheme.surface,
            },
          ]}
          onPress={onOpenSchedule}
        >
          <Text style={[styles.staffActionText, { color: currentTheme.textPrimary }]}>Horaires</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.staffSection, { backgroundColor: currentTheme.surface }]}>
        <Text style={[styles.staffSectionTitle, { color: currentTheme.textPrimary }]}>
          Tous les employés
        </Text>
        {staffLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={currentTheme.pillActiveBg} />
          </View>
        ) : staffUsers.length === 0 ? (
          <Text style={[styles.sectionEmpty, { color: currentTheme.textSecondary }]}>
            Aucun employé configuré.
          </Text>
        ) : (
          staffUsers.map((user) => (
            <TouchableOpacity
              key={user.id}
              style={[
                styles.staffRow,
                { borderTopColor: currentTheme.border },
                selectedStaff?.id === user.id && {
                  ...styles.staffRowSelected,
                  backgroundColor: isDark ? currentTheme.surfaceMuted : '#EFF6FF',
                },
              ]}
              onPress={() => onSelectStaff(user)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.staffName, { color: currentTheme.textPrimary }]}>
                  {user.username}
                </Text>
                <Text style={[styles.staffMeta, { color: currentTheme.textSecondary }]}>
                  {user.role === 'cook'
                    ? 'Cuisine'
                    : user.role === 'delivery'
                    ? 'Livraison'
                    : 'Gestion'}
                </Text>
              </View>
              <View
                style={[
                  styles.staffStatusPill,
                  { backgroundColor: user.isActive ? '#DCFCE7' : '#FEE2E2' },
                ]}
              >
                <Text
                  style={[
                    styles.staffStatusText,
                    { color: user.isActive ? '#15803D' : '#B91C1C' },
                  ]}
                >
                  {user.isActive ? 'Actif' : 'Inactif'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={[styles.staffSection, { backgroundColor: currentTheme.surface }]}>
        <Text style={[styles.staffSectionTitle, { color: currentTheme.textPrimary }]}>
          Livreurs actifs
        </Text>
        {staffLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={currentTheme.pillActiveBg} />
          </View>
        ) : (
          staffUsers
            .filter((u) => u.role === 'delivery' && u.isActive)
            .map((user) => (
              <View
                key={user.id}
                style={[styles.staffRow, { borderTopColor: currentTheme.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.staffName, { color: currentTheme.textPrimary }]}>
                    {user.username}
                  </Text>
                  <Text style={[styles.staffMeta, { color: currentTheme.textSecondary }]}>
                    Statut:{' '}
                    {orders.some(
                      (o) =>
                        (o.status === 'assigned' || o.status === 'enroute') &&
                        o.driverId === user.id,
                    )
                      ? 'En livraison'
                      : 'Disponible'}
                  </Text>
                </View>
                {orders.some(
                  (o) =>
                    (o.status === 'assigned' || o.status === 'enroute') &&
                    o.driverId === user.id,
                ) ? (
                  <View style={[styles.staffStatusPill, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[styles.staffStatusText, { color: '#92400E' }]}>
                      En livraison
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.staffStatusPill, { backgroundColor: '#DBEAFE' }]}>
                    <Text style={[styles.staffStatusText, { color: '#1D4ED8' }]}>Disponible</Text>
                  </View>
                )}
              </View>
            ))
        )}
      </View>
    </ScrollView>
  );
}


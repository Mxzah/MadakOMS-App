import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { KitchenOrder } from '../../../types/orders';
import { colors } from '../../kitchen/constants';
import type { StaffUser } from '../types';
import { styles } from '../styles';

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
}: StaffTabProps) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.staffContent}>
      <View style={styles.staffHeaderRow}>
        <Text style={styles.sectionTitle}>Équipe</Text>
      </View>
      <View style={styles.staffActionsRow}>
        <TouchableOpacity style={styles.staffActionButton} onPress={onAddStaff}>
          <Text style={styles.staffActionText}>Ajouter</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.staffActionButton} onPress={onResetPassword}>
          <Text style={styles.staffActionText}>Réinit. mot de passe</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.staffActionButton} onPress={onToggleActive}>
          <Text style={styles.staffActionText}>Activer / désactiver</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.staffActionButton} onPress={onOpenSchedule}>
          <Text style={styles.staffActionText}>Horaires</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.staffSection}>
        <Text style={styles.staffSectionTitle}>Tous les employés</Text>
        {staffLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : staffUsers.length === 0 ? (
          <Text style={styles.sectionEmpty}>Aucun employé configuré.</Text>
        ) : (
          staffUsers.map((user) => (
            <TouchableOpacity
              key={user.id}
              style={[styles.staffRow, selectedStaff?.id === user.id && styles.staffRowSelected]}
              onPress={() => onSelectStaff(user)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.staffName}>{user.username}</Text>
                <Text style={styles.staffMeta}>
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

      <View style={styles.staffSection}>
        <Text style={styles.staffSectionTitle}>Livreurs actifs</Text>
        {staffLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          staffUsers
            .filter((u) => u.role === 'delivery' && u.isActive)
            .map((user) => (
              <View key={user.id} style={styles.staffRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.staffName}>{user.username}</Text>
                  <Text style={styles.staffMeta}>
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


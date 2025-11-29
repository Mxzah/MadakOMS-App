import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../lib/supabase';
import type { KitchenOrder, KitchenStatus } from '../types/orders';
import {
  ORDER_DETAIL_SELECT,
  formatAddress,
  formatDateTime,
  getCustomerEmail,
  getCustomerName,
  getCustomerPhone,
  mapOrderRowToKitchenOrder,
} from '../utils/orderHelpers';
import { colors } from './kitchen/constants';

type ManagerViewProps = {
  staff: {
    restaurantId: string;
    restaurantName: string;
    role: string;
    staffUserId: string;
  };
  onLogout: () => void;
};

type DateFilterId = 'today' | 'yesterday' | 'week' | 'month';
type FulfillmentFilterId = 'all' | 'delivery' | 'pickup';
type ManagerTabId = 'orders' | 'staff';

type StaffUser = {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  authUserId: string;
};

const STATUS_SECTIONS: Array<{
  id: KitchenStatus | 'cancelled_failed';
  label: string;
}> = [
  { id: 'received', label: 'Reçues' },
  { id: 'preparing', label: 'En préparation' },
  { id: 'ready', label: 'Prêtes' },
  { id: 'assigned', label: 'Assignées' },
  { id: 'enroute', label: 'En route' },
  { id: 'completed', label: 'Terminées' },
  { id: 'cancelled_failed', label: 'Annulées / Échouées' },
];

export function ManagerView({ staff, onLogout }: ManagerViewProps) {
  const [activeTab, setActiveTab] = useState<ManagerTabId>('orders');

  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterId>('today');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilterId>('all');
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);

  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [addRole, setAddRole] = useState<'cook' | 'delivery' | 'manager'>('cook');
  const [addPassword, setAddPassword] = useState('');
  const [addTempPassword, setAddTempPassword] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_DETAIL_SELECT)
        .eq('restaurant_id', staff.restaurantId)
        .in('status', [
          'received',
          'preparing',
          'ready',
          'assigned',
          'enroute',
          'completed',
          'cancelled',
          'failed',
        ])
        .order('placed_at', { ascending: false });

      if (error) {
        console.warn(error);
        return;
      }

      setOrders(data?.map(mapOrderRowToKitchenOrder) ?? []);
    } finally {
      setLoading(false);
    }
  }, [staff.restaurantId]);

  const fetchStaffUsers = useCallback(async () => {
    try {
      setStaffLoading(true);
      const { data, error } = await supabase
        .from('staff_users')
        .select('id, username, role, is_active, auth_user_id')
        .eq('restaurant_id', staff.restaurantId)
        .order('username', { ascending: true });

      if (error) {
        console.warn(error);
        return;
      }

      setStaffUsers(
        (data ?? []).map((row: any) => ({
          id: row.id,
          username: row.username,
          role: row.role,
          isActive: row.is_active,
          authUserId: row.auth_user_id,
        })),
      );
    } finally {
      setStaffLoading(false);
    }
  }, [staff.restaurantId]);

  useEffect(() => {
    fetchOrders();
    fetchStaffUsers();
  }, [fetchOrders, fetchStaffUsers]);

  const STAFF_EMAIL_DOMAIN = '@madak.internal';

  const generateRandomPassword = useCallback(() => {
    const random = Math.random().toString(36).slice(-6);
    const password = `Madak${random}!`;
    setAddPassword(password);
  }, []);

  const handleAddStaff = useCallback(async () => {
    if (!addUsername.trim()) {
      Alert.alert('Nom requis', "Veuillez saisir un nom d'utilisateur.");
      return;
    }

    try {
      setAddSaving(true);
      const username = addUsername.trim().toLowerCase().replace(/\s+/g, '');

      const bodyPayload: any = {
        action: 'add_staff',
        restaurantId: staff.restaurantId,
        username,
        role: addRole,
      };
      
      // Ajoute le password seulement s'il n'est pas vide
      const trimmedPassword = addPassword?.trim() || '';
      if (trimmedPassword.length > 0) {
        bodyPayload.password = trimmedPassword;
      }

      const { data, error } = await supabase.functions.invoke('staff-admin', {
        body: bodyPayload,
      });

      if (error) {
        console.warn(error);
        Alert.alert('Erreur', "Impossible de créer l’employé. Vérifiez l’Edge Function.");
        return;
      }

      const tempPassword = (data as any)?.tempPassword as string | undefined;
      if (tempPassword) {
        setAddTempPassword(tempPassword);
      } else {
        setAddTempPassword(null);
      }

      setAddUsername('');
      setAddPassword('');
      setAddRole('cook');
      await fetchStaffUsers();
    } finally {
      setAddSaving(false);
    }
  }, [addPassword, addRole, addUsername, fetchStaffUsers, staff.restaurantId]);

  const ensureStaffSelected = () => {
    if (!selectedStaff) {
      Alert.alert('Sélection requise', 'Sélectionnez un employé dans la liste.');
      return false;
    }
    return true;
  };

  const handleResetPassword = useCallback(async () => {
    if (!ensureStaffSelected()) return;
    if (!selectedStaff) return;

    if (!selectedStaff.authUserId) {
      Alert.alert('Erreur', 'Aucun identifiant d\'authentification trouvé pour cet employé.');
      return;
    }

    Alert.alert(
      'Réinitialiser le mot de passe',
      `Un nouveau mot de passe temporaire sera généré pour ${selectedStaff.username}.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              const { data, error } = await supabase.functions.invoke('staff-admin', {
                body: {
                  action: 'reset_password',
                  authUserId: selectedStaff.authUserId,
                },
              });

              if (error) {
                console.warn(error);
                Alert.alert('Erreur', 'Impossible de réinitialiser le mot de passe.');
                return;
              }

              const newPassword = (data as any)?.tempPassword as string | undefined;
              if (newPassword) {
                Alert.alert(
                  'Mot de passe réinitialisé',
                  `Nouveau mot de passe pour ${selectedStaff.username} :\n\n${newPassword}\n\nCommuniquez ce mot de passe au membre.`,
                  [{ text: 'OK' }],
                );
              } else {
                Alert.alert('Erreur', 'Le mot de passe a été réinitialisé mais le nouveau mot de passe n\'a pas été retourné.');
              }
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  }, [selectedStaff]);

  const handleToggleActive = useCallback(async () => {
    if (!ensureStaffSelected()) return;
    if (!selectedStaff) return;

    const targetState = !selectedStaff.isActive;
    Alert.alert(
      targetState ? 'Activer le compte' : 'Désactiver le compte',
      targetState
        ? `Autoriser ${selectedStaff.username} à se connecter ?`
        : `Empêcher ${selectedStaff.username} de se connecter ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              const { error } = await supabase.functions.invoke('staff-admin', {
                body: {
                  action: 'toggle_active',
                  staffId: selectedStaff.id,
                  isActive: targetState,
                },
              });

              if (error) {
                console.warn(error);
                Alert.alert('Erreur', 'Impossible de mettre à jour le compte.');
                return;
              }

              // Rafraîchir la liste pour afficher le nouveau statut
              await fetchStaffUsers();
              
              // Mettre à jour le selectedStaff pour refléter le changement
              setSelectedStaff((prev) => prev ? { ...prev, isActive: targetState } : null);
              
              Alert.alert(
                'Succès',
                targetState
                  ? `${selectedStaff.username} peut maintenant se connecter.`
                  : `${selectedStaff.username} ne peut plus se connecter.`,
                [{ text: 'OK' }],
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  }, [selectedStaff, fetchStaffUsers]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders();
      fetchStaffUsers();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchOrders, fetchStaffUsers]);

  const filteredByControls = useMemo(() => {
    const now = new Date();

    let start: Date | null = null;
    let end: Date | null = null;

    if (dateFilter === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else if (dateFilter === 'yesterday') {
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      start = new Date(end);
      start.setDate(start.getDate() - 1);
    } else if (dateFilter === 'week') {
      end = now;
      start = new Date(now);
      start.setDate(start.getDate() - 7);
    } else if (dateFilter === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    return orders.filter((order) => {
      const placed = new Date(order.placedAt);
      const matchesDate =
        !start || !end || (placed.getTime() >= start.getTime() && placed.getTime() < end.getTime());

      const matchesFulfillment =
        fulfillmentFilter === 'all' ? true : order.fulfillment === fulfillmentFilter;

      const normalizedOrderNumber = order.orderNumber ? String(order.orderNumber) : '';
      const matchesSearch = search
        ? normalizedOrderNumber.toLowerCase().includes(search.toLowerCase())
        : true;

      return matchesDate && matchesFulfillment && matchesSearch;
    });
  }, [orders, dateFilter, fulfillmentFilter, search]);

  const grouped = useMemo(() => {
    return STATUS_SECTIONS.map((section) => {
      const sectionOrders = filteredByControls.filter((order) => {
        if (section.id === 'cancelled_failed') {
          return order.status === 'cancelled' || order.status === 'failed';
        }
        return order.status === section.id;
      });

      return { ...section, orders: sectionOrders };
    });
  }, [filteredByControls]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Gestion — MadakOMS</Text>
          <Text style={styles.subtitle}>{staff.restaurantName}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {(['orders', 'staff'] as ManagerTabId[]).map((id) => {
          const isActive = activeTab === id;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActiveTab(id)}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {id === 'orders' ? 'Commandes' : 'Équipe'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'orders' ? (
        <>
          <View style={styles.filtersRow}>
            <View style={styles.segmented}>
              {(['today', 'yesterday', 'week', 'month'] as DateFilterId[]).map((id) => {
                const isActive = dateFilter === id;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.segment, isActive && styles.segmentActive]}
                    onPress={() => setDateFilter(id)}
                  >
                    <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                      {id === 'today'
                        ? "Aujourd'hui"
                        : id === 'yesterday'
                        ? 'Hier'
                        : id === 'week'
                        ? 'Cette semaine'
                        : 'Ce mois-ci'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.segmented}>
              {(['all', 'pickup', 'delivery'] as FulfillmentFilterId[]).map((id) => {
                const isActive = fulfillmentFilter === id;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.segmentSmall, isActive && styles.segmentActive]}
                    onPress={() => setFulfillmentFilter(id)}
                  >
                    <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                      {id === 'all' ? 'Tous' : id === 'pickup' ? 'À emporter' : 'Livraison'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.searchRow}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher # commande"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              keyboardType="numeric"
            />
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {grouped.map((section) => (
                <View key={section.id} style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{section.label}</Text>
                    <Text style={styles.sectionCount}>{section.orders.length}</Text>
                  </View>

                  {section.orders.length === 0 ? (
                    <Text style={styles.sectionEmpty}>Aucune commande</Text>
                  ) : (
                    section.orders.map((order) => (
                      <TouchableOpacity
                        key={order.id}
                        style={styles.orderRow}
                        onPress={() => setSelectedOrder(order)}
                        activeOpacity={0.85}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.orderTitle}>
                            #{order.orderNumber ?? '—'} ·{' '}
                            {order.fulfillment === 'delivery' ? 'Livraison' : 'À emporter'}
                          </Text>
                          <Text style={styles.orderMeta}>
                            {getCustomerName(order)} · Placée {formatDateTime(order.placedAt)}
                          </Text>
                        </View>
                        <Text style={styles.orderStatus}>{order.status}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.staffContent}>
          <View style={styles.staffHeaderRow}>
            <Text style={styles.sectionTitle}>Équipe</Text>
            <View style={styles.staffActionsRow}>
              <TouchableOpacity
                style={styles.staffActionButton}
                onPress={() => {
                  setAddTempPassword(null);
                  setAddPassword('');
                  setAddModalVisible(true);
                }}
              >
                <Text style={styles.staffActionText}>Ajouter</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.staffActionButton}
                onPress={handleResetPassword}
              >
                <Text style={styles.staffActionText}>Réinit. mot de passe</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.staffActionButton}
                onPress={handleToggleActive}
              >
                <Text style={styles.staffActionText}>Activer / désactiver</Text>
              </TouchableOpacity>
            </View>
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
                  style={[
                    styles.staffRow,
                    selectedStaff?.id === user.id && styles.staffRowSelected,
                  ]}
                  onPress={() => setSelectedStaff(user)}
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
                        <Text style={[styles.staffStatusText, { color: '#1D4ED8' }]}>
                          Disponible
                        </Text>
                      </View>
                    )}
                  </View>
                ))
            )}
          </View>
        </ScrollView>
      )}

      <Modal
        visible={Boolean(selectedOrder)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedOrder(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedOrder(null)}>
          <Pressable style={styles.modalSheet}>
            {selectedOrder && (
              <ScrollView contentContainerStyle={styles.modalContent}>
                <Text style={styles.modalTitle}>
                  Commande #{selectedOrder.orderNumber ?? '—'} ·{' '}
                  {selectedOrder.fulfillment === 'delivery' ? 'Livraison' : 'À emporter'}
                </Text>
                <Text style={styles.modalMeta}>Placée {formatDateTime(selectedOrder.placedAt)}</Text>

                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Client</Text>
                  <Text style={styles.modalText}>{getCustomerName(selectedOrder)}</Text>
                  <Text style={styles.modalSubText}>Tél. {getCustomerPhone(selectedOrder)}</Text>
                  {getCustomerEmail(selectedOrder) ? (
                    <Text style={styles.modalSubText}>
                      Courriel : {getCustomerEmail(selectedOrder)}
                    </Text>
                  ) : null}
                  {selectedOrder.deliveryAddress ? (
                    <Text style={styles.modalSubText}>
                      {formatAddress(selectedOrder.deliveryAddress)}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Articles</Text>
                  {selectedOrder.items.map((item) => (
                    <View key={item.id} style={styles.modalItemRow}>
                      <Text style={styles.modalText}>
                        {item.quantity} × {item.name}
                      </Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setSelectedOrder(null)}
                >
                  <Text style={styles.modalCloseText}>Fermer</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setAddModalVisible(false)}>
          <Pressable style={styles.modalSheet}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalTitle}>Ajouter un membre</Text>
              <Text style={styles.modalMeta}>
                Un compte interne sera créé avec un courriel pseudo comme
                <Text style={{ fontWeight: '600' }}> nomutilisateur{STAFF_EMAIL_DOMAIN}</Text>.
              </Text>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Nom d’utilisateur</Text>
                <TextInput
                  value={addUsername}
                  onChangeText={setAddUsername}
                  placeholder="ex: chef-cuisine"
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Rôle</Text>
                <View style={styles.segmented}>
                  {(['cook', 'delivery', 'manager'] as const).map((role) => {
                    const isActive = addRole === role;
                    return (
                      <TouchableOpacity
                        key={role}
                        style={[styles.segment, isActive && styles.segmentActive]}
                        onPress={() => setAddRole(role)}
                      >
                        <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                          {role === 'cook' ? 'Cuisine' : role === 'delivery' ? 'Livraison' : 'Gestion'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.modalSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.modalSectionTitle}>Mot de passe</Text>
                  <TouchableOpacity
                    onPress={generateRandomPassword}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      backgroundColor: colors.accent,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>Générer</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.modalSubText, { marginBottom: 8 }]}>
                  Laissez vide pour générer automatiquement un mot de passe aléatoire.
                </Text>
                <TextInput
                  value={addPassword}
                  onChangeText={setAddPassword}
                  placeholder="Mot de passe (optionnel)"
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              {addTempPassword && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Mot de passe temporaire</Text>
                  <Text style={styles.modalText}>{addTempPassword}</Text>
                  <Text style={styles.modalSubText}>
                    Communiquez ce mot de passe au membre. Il pourra le modifier via Supabase si besoin.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.modalCloseButton, addSaving && { opacity: 0.6 }]}
                onPress={handleAddStaff}
                disabled={addSaving}
              >
                <Text style={styles.modalCloseText}>
                  {addSaving ? 'Création…' : "Créer l'employé"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalCloseButton, { backgroundColor: '#E5E7EB', marginTop: 8 }]}
                onPress={() => setAddModalVisible(false)}
              >
                <Text style={[styles.modalCloseText, { color: colors.dark }]}>Fermer</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: colors.muted,
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FEE2E2',
  },
  logoutText: {
    color: '#B91C1C',
    fontWeight: '600',
    fontSize: 13,
  },
  filtersRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    padding: 4,
  },
  segment: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSmall: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
    color: colors.dark,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  sectionCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  sectionEmpty: {
    fontSize: 13,
    color: colors.muted,
    paddingVertical: 6,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  orderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
  },
  orderMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  orderStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginLeft: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  modalContent: {
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  modalMeta: {
    fontSize: 13,
    color: colors.muted,
  },
  modalSection: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    color: colors.dark,
  },
  modalText: {
    fontSize: 14,
    color: colors.dark,
  },
  modalSubText: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  modalItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  modalCloseButton: {
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  tabButtonActive: {
    backgroundColor: colors.accent,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  staffContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 24,
  },
  staffHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  staffActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  staffActionButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  staffActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.dark,
  },
  staffSection: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: 4,
  },
  staffSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 4,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  staffRowSelected: {
    backgroundColor: '#EFF6FF',
  },
  staffName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
  },
  staffMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  staffStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  staffStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
});



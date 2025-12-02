import { useCallback, useEffect, useState } from 'react';
import { Alert, SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import type { KitchenOrder } from '../../types/orders';
import { AddStaffModal } from './components/AddStaffModal';
import { OrderDetailModal } from './components/OrderDetailModal';
import { AnalyticsTab } from './components/AnalyticsTab';
import { OrdersTab } from './components/OrdersTab';
import { ResetPasswordModal } from './components/ResetPasswordModal';
import { ScheduleModal } from './components/ScheduleModal';
import { SettingsTab } from './components/SettingsTab';
import { StaffTab } from './components/StaffTab';
import { useOrders } from './hooks/useOrders';
import { useRestaurantSettings } from './hooks/useRestaurantSettings';
import { useStaff } from './hooks/useStaff';
import type { ManagerTabId, ManagerViewProps } from './types';
import { styles } from './styles';

export function ManagerView({ staff, onLogout }: ManagerViewProps) {
  const [activeTab, setActiveTab] = useState<ManagerTabId>('orders');
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [resetPasswordModalVisible, setResetPasswordModalVisible] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);

  const {
    orders,
    loading,
    search,
    setSearch,
    dateFilter,
    setDateFilter,
    fulfillmentFilter,
    setFulfillmentFilter,
    grouped,
    refetch: refetchOrders,
  } = useOrders(staff.restaurantId);

  const {
    staffUsers,
    staffLoading,
    selectedStaff,
    setSelectedStaff,
    fetchStaffUsers,
    ensureStaffSelected,
    handleToggleActive,
  } = useStaff(staff.restaurantId);

  const {
    restaurantInfo,
    orderingSettings,
    loading: settingsLoading,
    saving: settingsSaving,
    saveRestaurantInfo,
    saveOrderingSettings,
  } = useRestaurantSettings(staff.restaurantId);

  useEffect(() => {
    fetchStaffUsers();
  }, [fetchStaffUsers]);

  const handleResetPassword = useCallback(() => {
    if (!ensureStaffSelected()) return;
    if (!selectedStaff) return;

    if (!selectedStaff.authUserId) {
      Alert.alert('Erreur', 'Aucun identifiant d\'authentification trouvé pour cet employé.');
      return;
    }

    setResetPasswordModalVisible(true);
  }, [selectedStaff, ensureStaffSelected]);

  const handleOpenScheduleModal = useCallback(() => {
    if (!ensureStaffSelected()) return;
    setScheduleModalVisible(true);
  }, [ensureStaffSelected]);

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
        {(['orders', 'staff', 'settings', 'analytics'] as ManagerTabId[]).map((id) => {
          const isActive = activeTab === id;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActiveTab(id)}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {id === 'orders'
                  ? 'Commandes'
                  : id === 'staff'
                  ? 'Équipe'
                  : id === 'settings'
                  ? 'Réglages'
                  : 'Analyses'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'orders' ? (
        <OrdersTab
          loading={loading}
          search={search}
          setSearch={setSearch}
          dateFilter={dateFilter}
          setDateFilter={setDateFilter}
          fulfillmentFilter={fulfillmentFilter}
          setFulfillmentFilter={setFulfillmentFilter}
          grouped={grouped}
          onOrderSelect={setSelectedOrder}
        />
      ) : activeTab === 'staff' ? (
        <StaffTab
          staffUsers={staffUsers}
          staffLoading={staffLoading}
          selectedStaff={selectedStaff}
          orders={orders}
          onSelectStaff={setSelectedStaff}
          onAddStaff={() => setAddModalVisible(true)}
          onResetPassword={handleResetPassword}
          onToggleActive={handleToggleActive}
          onOpenSchedule={handleOpenScheduleModal}
        />
      ) : activeTab === 'settings' ? (
        <SettingsTab
          restaurantInfo={restaurantInfo}
          orderingSettings={orderingSettings}
          loading={settingsLoading}
          saving={settingsSaving}
          restaurantId={staff.restaurantId}
          onUpdateRestaurantInfo={saveRestaurantInfo}
          onUpdateOrderingSettings={saveOrderingSettings}
        />
      ) : (
        <AnalyticsTab restaurantId={staff.restaurantId} />
      )}

      <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />

      <AddStaffModal
        visible={addModalVisible}
        restaurantId={staff.restaurantId}
        onClose={() => setAddModalVisible(false)}
        onSuccess={fetchStaffUsers}
      />

      <ResetPasswordModal
        visible={resetPasswordModalVisible}
        staff={selectedStaff}
        onClose={() => setResetPasswordModalVisible(false)}
      />

      <ScheduleModal
        visible={scheduleModalVisible}
        staff={selectedStaff}
        onClose={() => setScheduleModalVisible(false)}
        onSuccess={fetchStaffUsers}
      />
    </SafeAreaView>
  );
}


import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { kitchenThemes } from '../kitchen/constants';
import type { KitchenTheme } from '../kitchen/types';

export function ManagerView({ staff, onLogout }: ManagerViewProps) {
  const [activeTab, setActiveTab] = useState<ManagerTabId>('orders');
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [resetPasswordModalVisible, setResetPasswordModalVisible] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

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

  const handleToggleDarkMode = useCallback((enabled: boolean) => {
    setDarkModeEnabled(enabled);
  }, []);

  const theme: KitchenTheme = kitchenThemes[darkModeEnabled ? 'dark' : 'light'];
  const isDark = darkModeEnabled;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Gestion — MadakOMS</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{staff.restaurantName}</Text>
        </View>
      </View>

      <View style={styles.tabBar}>
        {(['orders', 'staff', 'analytics', 'settings'] as ManagerTabId[]).map((id) => {
          const isActive = activeTab === id;
          return (
            <TouchableOpacity
              key={id}
              style={[
                styles.tabButton,
                {
                  backgroundColor: isActive ? theme.pillActiveBg : theme.surfaceMuted,
                },
              ]}
              onPress={() => setActiveTab(id)}
            >
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? theme.pillActiveText : theme.textSecondary,
                  },
                ]}
              >
                {id === 'orders'
                  ? 'Commandes'
                  : id === 'staff'
                  ? 'Équipe'
                  : id === 'analytics'
                  ? 'Analyses'
                  : 'Réglages'}
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
          theme={theme}
          isDark={isDark}
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
          theme={theme}
          isDark={isDark}
        />
      ) : activeTab === 'analytics' ? (
        <AnalyticsTab restaurantId={staff.restaurantId} theme={theme} isDark={isDark} />
      ) : (
        <SettingsTab
          restaurantInfo={restaurantInfo}
          orderingSettings={orderingSettings}
          loading={settingsLoading}
          saving={settingsSaving}
          restaurantId={staff.restaurantId}
          onUpdateRestaurantInfo={saveRestaurantInfo}
          onUpdateOrderingSettings={saveOrderingSettings}
          darkModeEnabled={darkModeEnabled}
          onToggleDarkMode={handleToggleDarkMode}
          onLogout={onLogout}
          theme={theme}
          isDark={isDark}
        />
      )}

      <OrderDetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        theme={theme}
        isDark={isDark}
      />

      <AddStaffModal
        visible={addModalVisible}
        restaurantId={staff.restaurantId}
        onClose={() => setAddModalVisible(false)}
        onSuccess={fetchStaffUsers}
        theme={theme}
        isDark={isDark}
      />

      <ResetPasswordModal
        visible={resetPasswordModalVisible}
        staff={selectedStaff}
        onClose={() => setResetPasswordModalVisible(false)}
        theme={theme}
        isDark={isDark}
      />

      <ScheduleModal
        visible={scheduleModalVisible}
        staff={selectedStaff}
        onClose={() => setScheduleModalVisible(false)}
        onSuccess={fetchStaffUsers}
        theme={theme}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}


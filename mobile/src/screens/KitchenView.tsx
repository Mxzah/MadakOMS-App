import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer } from 'expo-audio';

import { supabase } from '../lib/supabase';
import { HistoryOrder, KitchenBoardStatus, KitchenOrder } from '../types/orders';
import {
  ORDER_DETAIL_SELECT,
  formatAddress,
  formatDateTime,
  getCustomerName,
  getCustomerPhone,
  getPriorityFlags,
  historyStatusStyle,
  historySubtitle,
  mapOrderRowToKitchenOrder,
} from '../utils/orderHelpers';

const NOTIFICATION_SOUND_URL = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

const colors = {
  background: '#F5F6FB',
  surface: '#FFFFFF',
  dark: '#1B1C1F',
  muted: '#6B7280',
  border: '#E5E7EB',
  accent: '#2563EB',
  danger: '#DC2626',
};

type KitchenTheme = {
  background: string;
  surface: string;
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  pillActiveBg: string;
  pillActiveText: string;
};

const kitchenThemes: Record<'light' | 'dark', KitchenTheme> = {
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

const ORDER_FILTERS: Array<{ id: KitchenBoardStatus; label: string }> = [
  { id: 'received', label: 'Nouvelles' },
  { id: 'preparing', label: 'En préparation' },
  { id: 'ready', label: 'Prêtes' },
];

type KitchenViewProps = {
  staff: {
    restaurantId: string;
    restaurantName: string;
    role: string;
  };
  onLogout: () => void;
};

export function KitchenView({ staff, onLogout }: KitchenViewProps) {
  const [activeTab, setActiveTab] = useState<'orders' | 'history' | 'settings'>('orders');
  const [settings, setSettings] = useState({
    soundEnabled: true,
    theme: 'light' as 'light' | 'dark',
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
          Rôle: {staff.role}
        </Text>
        <Text style={[styles.kitchenSubtitle, { color: theme.textSecondary }]}>
          {staff.restaurantName}
        </Text>
      </View>

      <View style={styles.kitchenTabBar}>
        {(['orders', 'history', 'settings'] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.kitchenTabButton,
                { backgroundColor: isActive ? theme.pillActiveBg : theme.surfaceMuted },
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
          />
        ) : activeTab === 'history' ? (
          <HistoryTab restaurantId={staff.restaurantId} theme={theme} isDark={isDark} />
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

type OrdersTabProps = {
  restaurantId: string;
  theme: KitchenTheme;
  isDark: boolean;
  notificationsEnabled: boolean;
};

function OrdersTab({ restaurantId, theme, isDark, notificationsEnabled }: OrdersTabProps) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<KitchenBoardStatus>('received');
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);
  const [reasonOrder, setReasonOrder] = useState<KitchenOrder | null>(null);
  const [reasonText, setReasonText] = useState('');
  const latestReceivedIdsRef = useRef<Set<string>>(new Set());
  const hasMountedRef = useRef(false);
  const notificationPlayer = useAudioPlayer(NOTIFICATION_SOUND_URL, { downloadFirst: true });

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_DETAIL_SELECT)
      .eq('restaurant_id', restaurantId)
      .in('status', ['received', 'preparing', 'ready'])
      .order('placed_at', { ascending: true });

    if (error) {
      Alert.alert('Erreur', 'Impossible de récupérer les commandes.');
      return;
    }

    setOrders(data?.map(mapOrderRowToKitchenOrder) ?? []);
    setLoading(false);
  }, [restaurantId]);

  const playNotification = useCallback(async () => {
    try {
      if (notificationsEnabled) {
        if (!notificationPlayer) {
          return;
        }
        await notificationPlayer.seekTo(0);
        notificationPlayer.play();
      } else {
        Vibration.vibrate(400);
      }
    } catch (err) {
      console.warn('Notification audio impossible', err);
    }
  }, [notificationPlayer, notificationsEnabled]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchOrders]);

  useEffect(() => {
    const receivedOrders = orders.filter((order) => order.status === 'received');
    const nextIds = new Set(receivedOrders.map((order) => order.id));

    if (hasMountedRef.current) {
      let hasNew = false;
      nextIds.forEach((id) => {
        if (!latestReceivedIdsRef.current.has(id)) {
          hasNew = true;
        }
      });
      if (hasNew) {
        playNotification();
      }
    } else {
      hasMountedRef.current = true;
    }

    latestReceivedIdsRef.current = nextIds;
  }, [orders, playNotification]);

  useEffect(() => {
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const status = (payload.new as any)?.status ?? (payload.old as any)?.status;
          if (status && ['received', 'preparing', 'ready'].includes(status)) {
            fetchOrders();
          }
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders, restaurantId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  const updateOrderStatus = async (
    orderId: string,
    status: KitchenBoardStatus | 'cancelled',
    cancellationReason?: string
  ) => {
    const payload: Record<string, any> = { status };
    if (cancellationReason) {
      payload.cancellation_reason = cancellationReason;
    }

    const { error } = await supabase.from('orders').update(payload).eq('id', orderId);
    if (error) {
      Alert.alert('Erreur', 'Échec de la mise à jour.');
      return;
    }
    fetchOrders();
  };

  const filteredOrders = orders.filter((order) => order.status === selectedFilter);

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollBody}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.filterRow}>
          {ORDER_FILTERS.map((filter) => {
            const isActive = selectedFilter === filter.id;
            return (
              <TouchableOpacity
                key={filter.id}
                style={[
                  styles.filterPill,
                  { backgroundColor: isActive ? theme.pillActiveBg : theme.surfaceMuted },
                ]}
                onPress={() => setSelectedFilter(filter.id)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: isActive ? theme.pillActiveText : theme.textSecondary },
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : filteredOrders.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.emptyCardTitle, { color: theme.textPrimary }]}>Aucune commande</Text>
            <Text style={[styles.emptyCardCopy, { color: theme.textSecondary }]}>
              Les nouvelles commandes apparaîtront ici.
            </Text>
          </View>
        ) : (
          filteredOrders.map((order) => {
            const flags = getPriorityFlags(order);
            return (
              <TouchableOpacity
                key={order.id}
                style={[styles.orderCard, { backgroundColor: theme.surface }]}
                onPress={() => setSelectedOrder(order)}
                activeOpacity={0.85}
              >
                <View style={styles.orderCardHeader}>
                  <Text style={[styles.orderNumber, { color: theme.textPrimary }]}>
                    Commande #{order.orderNumber ?? '—'}
                  </Text>
                  <Text style={[styles.orderStatus, { color: theme.textSecondary }]}>
                    {order.fulfillment === 'delivery' ? 'Livraison' : 'À emporter'}
                  </Text>
                </View>
                <Text style={[styles.orderMeta, { color: theme.textSecondary }]}>
                  Placée {formatDateTime(order.placedAt)}
                </Text>
                {order.scheduledAt ? (
                  <Text style={[styles.orderMeta, { color: theme.textSecondary }]}>
                    Prévue {formatDateTime(order.scheduledAt)}
                  </Text>
                ) : null}
                <View style={styles.orderPillsRow}>
                  <Text style={[styles.orderMeta, { color: theme.textSecondary }]}>
                    {order.items.length} articles
                  </Text>
                  <Text style={[styles.orderMeta, { color: theme.textSecondary }]}>
                    {getCustomerName(order)}
                  </Text>
                </View>
                <View style={styles.priorityRow}>
                  {flags.map((flag) => (
                    <View
                      key={`${order.id}-${flag.label}`}
                      style={[
                        styles.priorityPill,
                        {
                          backgroundColor:
                            flag.type === 'late'
                              ? isDark
                                ? '#EA580C'
                                : '#FCD34D'
                              : '#DBEAFE',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.priorityPillText,
                          { color: flag.type === 'late' ? '#1F2937' : '#1D4ED8' },
                        ]}
                      >
                        {flag.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <OrderDetailModal
        order={selectedOrder}
        theme={theme}
        onClose={() => setSelectedOrder(null)}
        onAccept={() => {
          if (!selectedOrder) return;
          updateOrderStatus(selectedOrder.id, 'preparing');
          setSelectedOrder(null);
        }}
        onMarkReady={() => {
          if (!selectedOrder) return;
          updateOrderStatus(selectedOrder.id, 'ready');
          setSelectedOrder(null);
        }}
        onRefuse={() => {
          if (!selectedOrder) return;
          setReasonOrder(selectedOrder);
          setReasonText('');
          setSelectedOrder(null);
        }}
      />

      <ReasonModal
        theme={theme}
        order={reasonOrder}
        reason={reasonText}
        onChangeReason={setReasonText}
        onCancel={() => setReasonOrder(null)}
        onConfirm={() => {
          if (!reasonOrder || !reasonText.trim()) {
            Alert.alert('Motif requis', 'Veuillez indiquer la raison.');
            return;
          }
          updateOrderStatus(reasonOrder.id, 'cancelled', reasonText.trim());
          setReasonOrder(null);
        }}
      />
    </View>
  );
}

type OrderDetailModalProps = {
  order: KitchenOrder | null;
  theme: KitchenTheme;
  onClose: () => void;
  onAccept: () => void;
  onMarkReady: () => void;
  onRefuse: () => void;
};

function OrderDetailModal({
  order,
  theme,
  onClose,
  onAccept,
  onMarkReady,
  onRefuse,
}: OrderDetailModalProps) {
  return (
    <Modal visible={Boolean(order)} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
          {order ? (
            <>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                Commande #{order.orderNumber ?? '—'}
              </Text>
              <Text style={[styles.modalMeta, { color: theme.textSecondary }]}>
                {order.fulfillment === 'delivery' ? 'Livraison' : 'À emporter'}
              </Text>
              <View style={[styles.modalSection, { backgroundColor: theme.surfaceMuted }]}>
                <Text style={[styles.modalSectionTitle, { color: theme.textPrimary }]}>
                  Articles
                </Text>
                {order.items.map((item) => (
                  <View key={item.id} style={styles.modalItemRow}>
                    <Text style={[styles.modalItemText, { color: theme.textPrimary }]}>
                      {item.quantity} × {item.name}
                    </Text>
                    {item.modifiers && item.modifiers.length > 0 ? (
                      <Text style={[styles.modalItemMeta, { color: theme.textSecondary }]}>
                        {item.modifiers.map((mod) => mod.option_name).join(', ')}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
              <View style={[styles.modalSection, { backgroundColor: theme.surfaceMuted }]}>
                <Text style={[styles.modalSectionTitle, { color: theme.textPrimary }]}>
                  Client
                </Text>
                <Text style={[styles.modalItemText, { color: theme.textPrimary }]}>
                  {getCustomerName(order)}
                </Text>
                <Text style={[styles.modalItemMeta, { color: theme.textSecondary }]}>
                  Tél. {getCustomerPhone(order)}
                </Text>
                {order.deliveryAddress ? (
                  <Text style={[styles.modalItemMeta, { color: theme.textSecondary }]}>
                    {formatAddress(order.deliveryAddress)}
                  </Text>
                ) : null}
              </View>

              {order.status === 'received' && (
                <TouchableOpacity style={styles.primaryAction} onPress={onAccept}>
                  <Text style={styles.primaryActionText}>Accepter & préparer</Text>
                </TouchableOpacity>
              )}
              {order.status === 'preparing' && (
                <TouchableOpacity
                  style={[styles.primaryAction, { backgroundColor: '#F97316' }]}
                  onPress={onMarkReady}
                >
                  <Text style={styles.primaryActionText}>Marquer prêt</Text>
                </TouchableOpacity>
              )}
              {order.status === 'received' && (
                <TouchableOpacity style={styles.secondaryAction} onPress={onRefuse}>
                  <Text style={[styles.secondaryActionText, { color: colors.danger }]}>Refuser</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.secondaryAction} onPress={onClose}>
                <Text style={[styles.secondaryActionText, { color: theme.textPrimary }]}>Fermer</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type ReasonModalProps = {
  order: KitchenOrder | null;
  theme: KitchenTheme;
  reason: string;
  onChangeReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function ReasonModal({ order, theme, reason, onChangeReason, onCancel, onConfirm }: ReasonModalProps) {
  return (
    <Modal visible={Boolean(order)} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalBackdrop} onPress={onCancel}>
        <KeyboardAvoidingView behavior="padding" style={styles.reasonSheetWrapper}>
          <Pressable style={[styles.reasonSheet, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Motif du refus</Text>
            <TextInput
              value={reason}
              onChangeText={onChangeReason}
              multiline
              placeholder="Expliquez brièvement..."
              placeholderTextColor={theme.textSecondary}
              style={[styles.reasonInput, { borderColor: theme.border, color: theme.textPrimary }]}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryAction} onPress={onCancel}>
                <Text style={[styles.secondaryActionText, { color: theme.textPrimary }]}>
                  Annuler
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryAction, { backgroundColor: colors.danger }]}
                onPress={onConfirm}
              >
                <Text style={styles.primaryActionText}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

type HistoryTabProps = {
  restaurantId: string;
  theme: KitchenTheme;
  isDark: boolean;
};

function HistoryTab({ restaurantId, theme, isDark }: HistoryTabProps) {
  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'today' | '7d'>('today');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<HistoryOrder | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<KitchenOrder | null>(null);

  const fetchHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select(
        `
          id,
          order_number,
          status,
          fulfillment,
          updated_at,
          completed_at,
          cancelled_at
        `
      )
      .eq('restaurant_id', restaurantId)
      .in('status', ['completed', 'cancelled'])
      .order('updated_at', { ascending: false });

    if (error) {
      Alert.alert('Erreur', 'Impossible de charger l’historique.');
      return;
    }

    const mapped: HistoryOrder[] =
      data?.map((row: any) => ({
        id: row.id,
        orderNumber: row.order_number ?? null,
        status: row.status,
        fulfillment: row.fulfillment,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
        cancelledAt: row.cancelled_at,
        placedAt: row.updated_at,
      })) ?? [];

    setHistory(mapped);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  }, [fetchHistory]);

  const filteredHistory = useMemo(() => {
    const cutoff =
      filter === 'today'
        ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
        : Date.now() - 7 * 24 * 60 * 60 * 1000;

    return history.filter((order) => {
      const updated = new Date(order.updatedAt).getTime();
      const matchesDate = updated >= cutoff;
      const matchesSearch = search
        ? `${order.orderNumber ?? ''}`.toLowerCase().includes(search.toLowerCase())
        : true;
      return matchesDate && matchesSearch;
    });
  }, [filter, history, search]);

  const renderItem = ({ item }: { item: HistoryOrder }) => {
    const badge = historyStatusStyle(item.status);
    return (
      <TouchableOpacity
        style={[
          styles.historyCard,
          { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: isDark ? '#000' : '#00000022' },
        ]}
        onPress={() => {
          setSelected(item);
          setDetailVisible(true);
          setDetail(null);
          setDetailLoading(true);
          (async () => {
            try {
              const { data: row, error } = await supabase
                .from('orders')
                .select(ORDER_DETAIL_SELECT)
                .eq('id', item.id)
                .maybeSingle();

              if (error) {
                Alert.alert('Erreur', 'Impossible de charger les détails.');
                setDetailVisible(false);
                return;
              }
              setDetail(row ? mapOrderRowToKitchenOrder(row) : null);
            } finally {
              setDetailLoading(false);
            }
          })();
        }}
      >
        <View style={styles.historyHeader}>
          <Text style={[styles.historyOrderNumber, { color: theme.textPrimary }]}>
            Commande #{item.orderNumber ?? '—'}
          </Text>
          <View style={[styles.historyBadge, { backgroundColor: badge.backgroundColor }]}>
            <Text style={[styles.historyBadgeText, { color: badge.color }]}>
              {item.status === 'completed' ? 'Terminée' : 'Annulée'}
            </Text>
          </View>
        </View>
        <Text style={[styles.historyMeta, { color: theme.textSecondary }]}>
          {historySubtitle(item)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.flex}>
      <View style={styles.historyFilterRow}>
        <TouchableOpacity
          style={[
            styles.filterPill,
            { backgroundColor: filter === 'today' ? theme.pillActiveBg : theme.surfaceMuted },
          ]}
          onPress={() => setFilter('today')}
        >
          <Text
            style={[
              styles.filterPillText,
              { color: filter === 'today' ? theme.pillActiveText : theme.textSecondary },
            ]}
          >
            Aujourd’hui
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterPill,
            { backgroundColor: filter === '7d' ? theme.pillActiveBg : theme.surfaceMuted },
          ]}
          onPress={() => setFilter('7d')}
        >
          <Text
            style={[
              styles.filterPillText,
              { color: filter === '7d' ? theme.pillActiveText : theme.textSecondary },
            ]}
          >
            7 derniers jours
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher # commande"
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.searchInput,
            { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.surface },
          ]}
        />
        {search ? (
          <TouchableOpacity style={styles.clearButton} onPress={() => setSearch('')}>
            <Text style={styles.clearButtonText}>Effacer</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredHistory}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20, gap: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.emptyCardTitle, { color: theme.textPrimary }]}>
                Aucun historique
              </Text>
              <Text style={[styles.emptyCardCopy, { color: theme.textSecondary }]}>
                Les commandes terminées apparaîtront ici.
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={detailVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setDetailVisible(false);
            setDetail(null);
            setDetailLoading(false);
          }}
        >
          <Pressable style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            {detailLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : detail ? (
              <>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                  Commande #{detail.orderNumber ?? '—'}
                </Text>
                <Text style={[styles.modalMeta, { color: theme.textSecondary }]}>
                  {detail.status === 'completed' ? 'Terminée' : 'Annulée'}
                </Text>
                <View style={[styles.modalSection, { backgroundColor: theme.surfaceMuted }]}>
                  <Text style={[styles.modalSectionTitle, { color: theme.textPrimary }]}>
                    Client
                  </Text>
                  <Text style={[styles.modalItemText, { color: theme.textPrimary }]}>
                    {getCustomerName(detail)}
                  </Text>
                  <Text style={[styles.modalItemMeta, { color: theme.textSecondary }]}>
                    Tél. {getCustomerPhone(detail)}
                  </Text>
                  {detail.deliveryAddress ? (
                    <Text style={[styles.modalItemMeta, { color: theme.textSecondary }]}>
                      {formatAddress(detail.deliveryAddress)}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.modalSection, { backgroundColor: theme.surfaceMuted }]}>
                  <Text style={[styles.modalSectionTitle, { color: theme.textPrimary }]}>
                    Articles
                  </Text>
                  {detail.items.map((item) => (
                    <View key={item.id} style={styles.modalItemRow}>
                      <Text style={[styles.modalItemText, { color: theme.textPrimary }]}>
                        {item.quantity} × {item.name}
                      </Text>
                      {item.modifiers && item.modifiers.length > 0 ? (
                        <Text style={[styles.modalItemMeta, { color: theme.textSecondary }]}>
                          {item.modifiers.map((mod) => mod.option_name).join(', ')}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.primaryAction}
                  onPress={() => {
                    setDetailVisible(false);
                    setDetail(null);
                  }}
                >
                  <Text style={styles.primaryActionText}>Fermer</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={[styles.modalMeta, { color: theme.textSecondary }]}>
                Aucun détail disponible.
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

type SettingsState = {
  soundEnabled: boolean;
  theme: 'light' | 'dark';
};

type SettingsTabProps = {
  settings: SettingsState;
  onChangeSettings: Dispatch<SetStateAction<SettingsState>>;
  onLogout: () => void;
  theme: KitchenTheme;
};

function SettingsTab({ settings, onChangeSettings, onLogout, theme }: SettingsTabProps) {
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  kitchenSafeArea: {
    flex: 1,
  },
  kitchenHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  kitchenTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  kitchenSubtitle: {
    marginTop: 4,
    fontSize: 14,
  },
  kitchenTabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 8,
  },
  kitchenTabButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  kitchenTabLabel: {
    fontWeight: '600',
  },
  kitchenContent: {
    flex: 1,
  },
  scrollBody: {
    padding: 20,
    gap: 16,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  historyFilterRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  filterPillText: {
    fontWeight: '600',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyCard: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyCardTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptyCardCopy: {
    textAlign: 'center',
    fontSize: 14,
  },
  orderCard: {
    borderRadius: 20,
    padding: 18,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  orderStatus: {
    fontWeight: '600',
  },
  orderMeta: {
    fontSize: 13,
  },
  orderPillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  priorityPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  priorityPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '90%',
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalMeta: {
    fontSize: 14,
  },
  modalSection: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#F5F6FB',
    gap: 8,
  },
  modalSectionTitle: {
    fontWeight: '600',
  },
  modalItemRow: {
    gap: 4,
  },
  modalItemText: {
    fontWeight: '600',
  },
  modalItemMeta: {
    fontSize: 13,
    color: colors.muted,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  primaryAction: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryAction: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryActionText: {
    fontWeight: '600',
  },
  reasonSheetWrapper: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  reasonSheet: {
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  reasonInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
  },
  historyCard: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  historyOrderNumber: {
    fontSize: 17,
    fontWeight: '700',
  },
  historyBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  historyBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  historyMeta: {
    fontSize: 13,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clearButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
  },
  clearButtonText: {
    fontWeight: '600',
    color: '#1D4ED8',
  },
  settingCard: {
    borderRadius: 20,
    padding: 18,
    gap: 8,
    elevation: 2,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingSubtitle: {
    fontSize: 13,
  },
  logoutCard: {
    marginTop: 12,
    borderRadius: 18,
    padding: 16,
    backgroundColor: colors.danger,
    alignItems: 'center',
  },
  logoutText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});


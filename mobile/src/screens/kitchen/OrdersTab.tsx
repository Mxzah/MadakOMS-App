import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Vibration,
  KeyboardAvoidingView,
} from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { supabase } from '../../lib/supabase';
import { KitchenBoardStatus, KitchenOrder } from '../../types/orders';
import {
  ORDER_DETAIL_SELECT,
  formatAddress,
  formatDateTime,
  getCustomerName,
  getCustomerPhone,
  getPriorityFlags,
  mapOrderRowToKitchenOrder,
} from '../../utils/orderHelpers';
import { NOTIFICATION_SOUND_URL, colors, ORDER_FILTERS } from './constants';
import type { KitchenTheme } from './types';
import { styles } from './styles';

type OrdersTabProps = {
  restaurantId: string;
  theme: KitchenTheme;
  isDark: boolean;
  notificationsEnabled: boolean;
  staffRole: string;
};

export function OrdersTab({
  restaurantId,
  theme,
  isDark,
  notificationsEnabled,
  staffRole,
}: OrdersTabProps) {
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
    try {
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
    } finally {
      setLoading(false);
    }
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
    const receivedOrders = orders.filter(
      (order) => order.status === 'received' && order.fulfillment === 'delivery'
    );
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

    const eventPayload: Record<string, any> = { status };
    if (cancellationReason) {
      eventPayload.cancellation_reason = cancellationReason;
    }

    const { error: eventError } = await supabase.from('order_events').insert({
      order_id: orderId,
      actor_type: staffRole || 'cook',
      event_type: 'status_changed',
      payload: eventPayload,
    });

    if (eventError) {
      console.warn('Impossible d’enregistrer le journal des événements', eventError);
    }

    fetchOrders();
  };

  const filteredOrders = orders.filter((order) => {
    const statusMatch = order.status === selectedFilter;
    const deliveryOnly = selectedFilter !== 'received' || order.fulfillment === 'delivery';
    return statusMatch && deliveryOnly;
  });

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
        isDark={isDark}
        activeFilter={selectedFilter}
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
  isDark: boolean;
  activeFilter: KitchenBoardStatus;
  onClose: () => void;
  onAccept: () => void;
  onMarkReady: () => void;
  onRefuse: () => void;
};

function OrderDetailModal({
  order,
  theme,
  isDark,
  activeFilter,
  onClose,
  onAccept,
  onMarkReady,
  onRefuse,
}: OrderDetailModalProps) {
  const closeButtonColor =
    isDark && activeFilter === 'ready' ? '#60A5FA' : theme.textPrimary;

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
                <Text style={[styles.secondaryActionText, { color: closeButtonColor }]}>
                  Fermer
                </Text>
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


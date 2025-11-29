import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterId>('today');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilterId>('all');
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);

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

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchOrders]);

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
});



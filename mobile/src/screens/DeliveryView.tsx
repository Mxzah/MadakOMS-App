import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../lib/supabase';
import { AssignedOrder, AvailableOrder } from '../types/orders';
import {
  ORDER_DETAIL_SELECT,
  deriveDistance,
  deriveEta,
  getCityFromAddress,
} from '../utils/orderHelpers';

const colors = {
  background: '#F5F6FB',
  surface: '#FFFFFF',
  dark: '#1B1C1F',
  muted: '#6B7280',
  border: '#E5E7EB',
  accent: '#2563EB',
};

const DELIVERY_STATUSES = [
  { id: 'assigned', label: 'Assignée' },
  { id: 'ready', label: 'Prête' },
  { id: 'pickup', label: 'Ramasser au resto' },
  { id: 'enroute', label: 'En route' },
  { id: 'completed', label: 'Livrée' },
] as const;

type DeliveryViewProps = {
  staff: {
    restaurantId: string;
    restaurantName: string;
  };
  onLogout: () => void;
};

export function DeliveryView({ staff, onLogout }: DeliveryViewProps) {
  const [order, setOrder] = useState<AssignedOrder | null>(null);
  const [previewOrder, setPreviewOrder] = useState<AssignedOrder | null>(null);
  const [availableOrders, setAvailableOrders] = useState<AvailableOrder[]>([]);
  const [availableLoading, setAvailableLoading] = useState(true);
  const [deliveryTab, setDeliveryTab] = useState<'current' | 'available'>('current');
  const [previewItems, setPreviewItems] = useState<
    Array<{
      id: string;
      name: string;
      quantity: number;
      modifiers?: Array<{ modifier_name: string; option_name: string }>;
    }>
  >([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openMaps = useCallback(() => {
    if (!order) {
      return;
    }
    const address = encodeURIComponent(order.customerAddress);
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${address}`
        : `https://www.google.com/maps/dir/?api=1&destination=${address}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Erreur', 'Impossible d’ouvrir l’application de navigation.');
    });
  }, [order]);

  const fetchOrderItems = useCallback(async (orderId: string) => {
    try {
      setPreviewLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_DETAIL_SELECT)
        .eq('id', orderId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const detailItems =
        data?.order_items?.map((item: any) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          modifiers: item.order_item_modifiers ?? [],
        })) ?? [];

      setPreviewItems(detailItems);
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Impossible de récupérer les articles.'
      );
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const mapAvailableOrder = useCallback((row: any) => {
    const addr = row.delivery_address ?? {};
    const directAddress =
      typeof addr.address === 'string' && addr.address.trim().length > 0
        ? addr.address.trim()
        : null;

    const fallbackAddress =
      addr.line1 ?? addr.address_line1 ?? addr.street ?? addr.formatted ?? '';

    const addressText = directAddress ?? fallbackAddress;
    const addressParts = addressText
      ? addressText
          .split(',')
          .map((part: string) => part.trim())
          .filter(Boolean)
      : [];

    const streetLabel = addressParts[0] ?? fallbackAddress ?? 'Adresse à confirmer';
    const cityLabel =
      addressParts[1] ??
      addr.city ??
      addr.locality ??
      addr.municipality ??
      'Ville à confirmer';
    const orderNumber = row.order_number ?? 0;

    return {
      id: row.id,
      orderNumber,
      city: cityLabel,
      streetLabel,
      address: addressText || streetLabel,
      distance: deriveDistance(orderNumber),
      eta: deriveEta(orderNumber),
      status: (row.status as AssignedOrder['status']) ?? 'ready',
      customerName: row.customer?.first_name ?? null,
      customerPhone: row.customer?.phone ?? null,
      customerEmail: row.customer?.email ?? null,
    };
  }, []);

  const fetchAvailableOrders = useCallback(async () => {
    setAvailableLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_number, status, delivery_address, customer:customer_id(first_name, phone, email)'
        )
        .eq('restaurant_id', staff.restaurantId)
        .in('status', ['ready', 'assigned', 'enroute'])
        .order('placed_at', { ascending: true });

      if (error) {
        throw error;
      }

      const normalized = data?.map(mapAvailableOrder) ?? [];
      setAvailableOrders(normalized.filter((candidate) => candidate.status === 'ready'));
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error
          ? err.message
          : 'Impossible de récupérer les commandes disponibles.'
      );
    } finally {
      setAvailableLoading(false);
    }
  }, [mapAvailableOrder, staff.restaurantId]);

  const fetchActiveOrder = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select(
        `
          id,
          order_number,
          delivery_address,
          status,
          customers:customer_id (
            first_name,
            phone,
            email
          )
        `
      )
      .eq('restaurant_id', staff.restaurantId)
      .in('status', ['assigned', 'enroute'])
      .limit(1)
      .maybeSingle();

    if (data) {
      const customerInfo = Array.isArray(data.customers) ? data.customers[0] : data.customers;
      setOrder({
        id: data.id,
        orderNumber: data.order_number,
        restaurantName: staff.restaurantName,
        customerName: customerInfo?.first_name ?? null,
        customerPhone: customerInfo?.phone ?? null,
        customerEmail: customerInfo?.email ?? null,
        customerAddress: data.delivery_address?.address ?? 'Adresse à confirmer',
        itemsSummary: 'Détails disponibles après assignation',
        fulfillment: 'delivery',
        paymentInfo: 'paid_online',
        eta: deriveEta(Number(data.order_number ?? 0)),
        distance: deriveDistance(Number(data.order_number ?? 0)),
        status: data.status as AssignedOrder['status'],
      });
    } else {
      setOrder(null);
    }
  }, [staff.restaurantId, staff.restaurantName]);

  useEffect(() => {
    fetchAvailableOrders();
    fetchActiveOrder();
    const interval = setInterval(() => {
      fetchAvailableOrders();
      fetchActiveOrder();
    }, 20000);

    return () => clearInterval(interval);
  }, [fetchAvailableOrders, fetchActiveOrder]);

  const handleAcceptOrder = async (candidate: AvailableOrder) => {
    try {
      // Placeholder for future API call to assign order to the driver.
      setAvailableOrders((list) => list.filter((item) => item.id !== candidate.id));
      setDeliveryTab('current');
      fetchAvailableOrders();
      setPreviewOrder(null);
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Impossible d’accepter la commande.'
      );
    }
  };

  const content = useMemo(() => {
    if (deliveryTab === 'current') {
      return order ? (
        <DeliveryCard order={order} onNavigate={openMaps} onChangeStatus={() => undefined} />
      ) : (
        <View style={styles.deliveryEmpty}>
          <Text style={styles.deliveryEmptyTitle}>Aucune livraison active</Text>
          <Text style={styles.deliveryEmptySubtitle}>
            Dès qu’une commande sera assignée, elle apparaîtra ici.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setDeliveryTab('available')}>
            <Text style={styles.primaryButtonText}>Voir les commandes disponibles</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <AvailableOrdersList
        orders={availableOrders}
        loading={availableLoading}
        onAccept={handleAcceptOrder}
        onPreview={(candidate) => {
          setPreviewOrder({
            id: candidate.id,
            orderNumber: candidate.orderNumber,
            restaurantName: staff.restaurantName,
            customerName: candidate.customerName ?? null,
            customerPhone: candidate.customerPhone ?? null,
            customerEmail: candidate.customerEmail ?? null,
            customerAddress: candidate.address,
            itemsSummary: candidate.itemsSummary ?? 'Détails disponibles après assignation',
            fulfillment: 'delivery',
            paymentInfo: 'paid_online',
            eta: candidate.eta,
            status: candidate.status ?? 'ready',
          });
          setPreviewItems([]);
          fetchOrderItems(candidate.id);
        }}
      />
    );
  }, [
    availableLoading,
    availableOrders,
    deliveryTab,
    fetchOrderItems,
    handleAcceptOrder,
    openMaps,
    order,
    staff.restaurantName,
  ]);

  return (
    <SafeAreaView style={styles.deliverySafeArea}>
      <View style={styles.deliveryTopBar}>
        <View>
          <Text style={styles.deliveryTopLabel}>Application Livreur</Text>
          <Text style={styles.deliveryTopValue}>{staff.restaurantName}</Text>
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={onLogout}>
          <Text style={styles.secondaryButtonText}>Déconnexion</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.deliveryTabsRow}>
        <TouchableOpacity
          style={[styles.deliveryTabButton, deliveryTab === 'current' && styles.deliveryTabButtonActive]}
          onPress={() => setDeliveryTab('current')}
        >
          <Text
            style={[
              styles.deliveryTabLabel,
              deliveryTab === 'current' && styles.deliveryTabLabelActive,
            ]}
          >
            Livraisons actives
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.deliveryTabButton, deliveryTab === 'available' && styles.deliveryTabButtonActive]}
          onPress={() => setDeliveryTab('available')}
        >
          <Text
            style={[
              styles.deliveryTabLabel,
              deliveryTab === 'available' && styles.deliveryTabLabelActive,
            ]}
          >
            Commandes disponibles
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.deliveryWrapper}>{content}</ScrollView>

      <Modal
        visible={Boolean(previewOrder)}
        transparent
        animationType="slide"
        onRequestClose={() => setPreviewOrder(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPreviewOrder(null)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            {previewLoading ? (
              <View style={styles.orderEmptyState}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.orderEmptyCopy}>Chargement…</Text>
              </View>
            ) : (
              previewOrder && (
                <DeliveryCard
                  order={previewOrder}
                  onClose={() => setPreviewOrder(null)}
                  items={previewItems}
                  forceStatusLabel="Prête"
                  onChangeStatus={() => undefined}
                />
              )
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function AvailableOrdersList({
  orders,
  loading,
  onAccept,
  onPreview,
}: {
  orders: AvailableOrder[];
  loading: boolean;
  onAccept: (order: AvailableOrder) => void;
  onPreview: (order: AvailableOrder) => void;
}) {
  if (loading) {
    return (
      <View style={styles.deliveryEmpty}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.deliveryEmptySubtitle}>Chargement des commandes prêtes…</Text>
      </View>
    );
  }

  if (orders.length === 0) {
    return (
      <View style={styles.deliveryEmpty}>
        <Text style={styles.deliveryEmptyTitle}>Aucune commande prête</Text>
        <Text style={styles.deliveryEmptySubtitle}>
          Les nouvelles commandes prêtes apparaîtront ici dès qu’elles sont disponibles.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.availableList}>
      {orders.map((order) => (
        <View key={order.id} style={styles.availableCard}>
          <View style={styles.availableCardHeader}>
            <Text style={styles.availableOrderNumber}>Commande #{order.orderNumber}</Text>
            <Text style={styles.availableCity}>{order.city}</Text>
          </View>
          <Text style={styles.availableAddress}>{order.address}</Text>
          <View style={styles.availableMetaRow}>
            <Text style={styles.availableMeta}>{order.distance}</Text>
            <Text style={styles.availableMeta}>{order.eta}</Text>
          </View>
          <TouchableOpacity style={styles.availableSecondaryButton} onPress={() => onPreview(order)}>
            <Text style={styles.availableSecondaryButtonText}>Voir les informations</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.availablePrimaryButton} onPress={() => onAccept(order)}>
            <Text style={styles.availablePrimaryButtonText}>Accepter la commande</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

type DeliveryCardProps = {
  order: AssignedOrder;
  onNavigate?: () => void;
  onChangeStatus: (status: AssignedOrder['status']) => void;
  onClose?: () => void;
  forceStatusLabel?: string;
  items?: Array<{
    id: string;
    name: string;
    quantity: number;
    modifiers?: Array<{ modifier_name: string; option_name: string }>;
  }>;
};

function DeliveryCard({
  order,
  onNavigate,
  onChangeStatus,
  onClose,
  forceStatusLabel,
  items,
}: DeliveryCardProps) {
  const currentStatus =
    DELIVERY_STATUSES.find((status) => status.id === order.status) ?? { label: order.status };
  const cityLabel = getCityFromAddress(order.customerAddress);

  return (
    <View style={styles.availableCard}>
      <View style={styles.availableCardHeader}>
        <Text style={styles.availableOrderNumber}>Commande #{order.orderNumber ?? '—'}</Text>
        <Text style={styles.availableCity}>{cityLabel || forceStatusLabel || currentStatus.label}</Text>
      </View>
      <Text style={styles.availableAddress}>{order.customerAddress}</Text>
      <View style={styles.availableMetaRow}>
        <Text style={styles.availableMeta}>
          Paiement : {order.paymentInfo === 'paid_online' ? 'Payé en ligne' : 'Payable à la porte'}
        </Text>
        {order.eta ? <Text style={styles.availableMeta}>ETA : {order.eta}</Text> : null}
      </View>

      <View style={styles.deliveryActionButtons}>
        {onNavigate && (
          <TouchableOpacity style={styles.availableSecondaryButton} onPress={onNavigate}>
            <Text style={styles.availableSecondaryButtonText}>Naviguer</Text>
          </TouchableOpacity>
        )}
        {!onClose && order.status === 'assigned' && (
          <TouchableOpacity
            style={styles.availablePrimaryButton}
            onPress={() => onChangeStatus('pickup')}
          >
            <Text style={styles.availablePrimaryButtonText}>Je pars au resto</Text>
          </TouchableOpacity>
        )}
        {order.status === 'pickup' && (
          <TouchableOpacity
            style={styles.availablePrimaryButton}
            onPress={() => onChangeStatus('enroute')}
          >
            <Text style={styles.availablePrimaryButtonText}>Départ vers client</Text>
          </TouchableOpacity>
        )}
        {order.status === 'enroute' && (
          <TouchableOpacity
            style={styles.availablePrimaryButton}
            onPress={() => onChangeStatus('completed')}
          >
            <Text style={styles.availablePrimaryButtonText}>Livraison terminée</Text>
          </TouchableOpacity>
        )}
      </View>

      {items && items.length > 0 && (order.status === 'assigned' || order.status === 'enroute') ? (
        <View style={[styles.deliveryItemsList, { marginTop: 16 }]}>
          {items.map((item) => (
            <View key={item.id} style={styles.deliveryItemRow}>
              <Text style={styles.deliveryItemTitle}>
                {item.quantity} × {item.name}
              </Text>
              {item.modifiers && item.modifiers.length > 0 && (
                <Text style={styles.deliveryItemMeta}>
                  {item.modifiers.map((mod) => mod.option_name).join(', ')}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {order.status !== 'assigned' && items && items.length === 0 && (
        <Text style={styles.orderEmptyCopy}>Aucun article disponible pour cette commande.</Text>
      )}

      {onClose && (
        <TouchableOpacity style={styles.availableSecondaryButton} onPress={onClose}>
          <Text style={styles.availableSecondaryButtonText}>Fermer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  deliverySafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  deliveryTopBar: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deliveryTopLabel: {
    color: colors.muted,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  deliveryTopValue: {
    color: colors.dark,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.dark,
    fontWeight: '600',
  },
  deliveryTabsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    gap: 12,
  },
  deliveryTabButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    alignItems: 'center',
  },
  deliveryTabButtonActive: {
    backgroundColor: colors.accent,
  },
  deliveryTabLabel: {
    color: colors.muted,
    fontWeight: '600',
  },
  deliveryTabLabelActive: {
    color: '#FFFFFF',
  },
  deliveryWrapper: {
    padding: 20,
    flexGrow: 1,
  },
  deliveryEmpty: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  deliveryEmptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
  },
  deliveryEmptySubtitle: {
    textAlign: 'center',
    color: colors.muted,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  availableList: {
    gap: 16,
  },
  availableCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
    marginBottom: 10,
  },
  availableCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  availableOrderNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  availableCity: {
    fontWeight: '600',
    color: colors.accent,
  },
  availableAddress: {
    color: colors.dark,
    marginBottom: 8,
  },
  availableMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  availableMeta: {
    color: colors.muted,
    fontWeight: '600',
  },
  availableSecondaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginBottom: 10,
  },
  availableSecondaryButtonText: {
    fontWeight: '600',
    color: colors.dark,
  },
  availablePrimaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  availablePrimaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '85%',
  },
  orderEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  orderEmptyCopy: {
    color: colors.muted,
    textAlign: 'center',
  },
  deliveryActionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  deliveryItemsList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#FAFAFA',
    gap: 8,
  },
  deliveryItemRow: {
    gap: 4,
  },
  deliveryItemTitle: {
    fontWeight: '600',
    color: colors.dark,
  },
  deliveryItemMeta: {
    color: colors.muted,
    fontSize: 13,
  },
});


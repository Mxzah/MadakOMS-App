import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KitchenOrder, HistoryOrder } from '../../types/orders';
import {
  ORDER_DETAIL_SELECT,
  formatAddress,
  formatDateTime,
  getCustomerName,
  getCustomerPhone,
  getCustomerEmail,
  formatPaymentMethod,
  historyStatusStyle,
  historySubtitle,
  mapOrderRowToKitchenOrder,
} from '../../utils/orderHelpers';
import { supabase } from '../../lib/supabase';
import { colors } from './constants';
import type { KitchenTheme } from './types';
import { styles } from './styles';

type HistoryTabProps = {
  restaurantId: string;
  theme: KitchenTheme;
  isDark: boolean;
  kitchenMode: 'team' | 'individual' | 'chef';
  staffUserId: string;
};

export function HistoryTab({
  restaurantId,
  theme,
  isDark,
  kitchenMode,
  staffUserId,
}: HistoryTabProps) {
  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'today' | '7d'>('today');
  const [search, setSearch] = useState('');
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<KitchenOrder | null>(null);

  const fetchHistory = useCallback(async () => {
    // Récupérer les événements de changement de statut vers 'ready' ou 'cancelled'
    const { data: eventsData, error: eventsError } = await supabase
      .from('order_events')
      .select(
        `
          id,
          order_id,
          created_at,
          payload,
          orders!inner (
            id,
            order_number,
            restaurant_id,
            fulfillment,
            updated_at,
            completed_at,
            cancelled_at,
            cook_id,
            cook:staff_users!cook_id (
              username
            )
          )
        `
      )
      .eq('event_type', 'status_changed')
      .order('created_at', { ascending: false });

    if (eventsError) {
      Alert.alert('Erreur', 'Impossible de charger l\'historique.');
      return;
    }

    // Filtrer par restaurant_id et gérer les doublons (prendre le dernier événement pour chaque commande)
    const orderMap = new Map<string, any>();

    eventsData?.forEach((event: any) => {
      const order = Array.isArray(event.orders) ? event.orders[0] : event.orders;
      if (!order || order.restaurant_id !== restaurantId) return;

      const payload = event.payload || {};
      const status = payload.status;

      // Filtrer uniquement les événements avec status 'ready' ou 'cancelled'
      if (status !== 'ready' && status !== 'cancelled') return;

      // En mode "Individuel", on filtre par cook_id
      if (kitchenMode === 'individual' && order.cook_id !== staffUserId) return;

      const orderId = order.id;

      // Si on n'a pas encore cette commande, ou si cet événement est plus récent, on le garde
      if (!orderMap.has(orderId) || new Date(event.created_at) > new Date(orderMap.get(orderId).eventCreatedAt)) {
        const cookInfo = Array.isArray(order.cook) ? order.cook[0] : order.cook;
        orderMap.set(orderId, {
          id: order.id,
          orderNumber: order.order_number ?? null,
          status: status,
          fulfillment: order.fulfillment,
          updatedAt: order.updated_at,
          completedAt: order.completed_at,
          cancelledAt: order.cancelled_at,
          placedAt: order.updated_at,
          cookName: cookInfo?.username ?? null,
          eventCreatedAt: event.created_at,
        });
      }
    });

    const mapped: HistoryOrder[] = Array.from(orderMap.values())
      .map((item) => {
        // Utiliser eventCreatedAt comme updatedAt pour le tri et l'affichage
        const { eventCreatedAt, ...rest } = item;
        return {
          ...rest,
          updatedAt: eventCreatedAt,
        };
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    setHistory(mapped);
    setLoading(false);
  }, [restaurantId, kitchenMode, staffUserId]);

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

  const openDetail = useCallback(
    async (entryId: string) => {
      try {
        setDetailVisible(true);
        setDetailLoading(true);
        const { data, error } = await supabase
          .from('orders')
          .select(ORDER_DETAIL_SELECT)
          .eq('id', entryId)
          .maybeSingle();

        if (error || !data) {
          throw error ?? new Error('Commande introuvable.');
        }

        setDetail(mapOrderRowToKitchenOrder(data));
      } catch (err) {
        Alert.alert('Erreur', 'Impossible de charger les détails.');
        setDetailVisible(false);
      } finally {
        setDetailLoading(false);
      }
    },
    []
  );

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
          renderItem={({ item }) => {
            const badge = historyStatusStyle(item.status);
            return (
              <TouchableOpacity
                style={[
                  styles.historyCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    shadowColor: isDark ? '#000' : '#00000022',
                  },
                ]}
                onPress={() => openDetail(item.id)}
              >
                <View style={styles.historyHeader}>
                  <Text style={[styles.historyOrderNumber, { color: theme.textPrimary }]}>
                    Commande #{item.orderNumber ?? '—'}
                  </Text>
                  <View style={[styles.historyBadge, { backgroundColor: badge.backgroundColor }]}>
                    <Text style={[styles.historyBadgeText, { color: badge.color }]}>
                      {item.status === 'ready' ? 'Terminée' : 'Annulée'}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <Text style={[styles.historyMeta, { color: theme.textSecondary }]}>
                    {historySubtitle(item)}
                  </Text>
                  {(kitchenMode === 'team' || kitchenMode === 'chef') && item.cookName && (
                    <Text
                      style={[
                        styles.historyMeta,
                        { color: theme.textSecondary, fontStyle: 'italic', textAlign: 'right' },
                      ]}
                    >
                      Préparé par : {item.cookName}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
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
                  {detail.status === 'ready' ? 'Terminée' : 'Annulée'}
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
                  {getCustomerEmail(detail) ? (
                    <Text style={[styles.modalItemMeta, { color: theme.textSecondary }]}>
                      Courriel : {getCustomerEmail(detail)}
                    </Text>
                  ) : null}
                  {detail.deliveryAddress ? (
                    <Text style={[styles.modalItemMeta, { color: theme.textSecondary }]}>
                      {formatAddress(detail.deliveryAddress)}
                    </Text>
                  ) : null}
                </View>
                {detail.paymentMethod ? (
                  <View style={[styles.modalSection, { backgroundColor: theme.surfaceMuted }]}>
                    <Text style={[styles.modalSectionTitle, { color: theme.textPrimary }]}>
                      Méthode de paiement
                    </Text>
                    <Text style={[styles.modalItemText, { color: theme.textPrimary }]}>
                      {formatPaymentMethod(detail.paymentMethod)}
                    </Text>
                    {detail.tipAmount && detail.tipAmount > 0 ? (
                      <Text style={[styles.modalItemMeta, { color: theme.textSecondary, marginTop: 8 }]}>
                        Pourboire : ${detail.tipAmount.toFixed(2)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
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
                  style={
                    isDark
                      ? [styles.primaryAction, { backgroundColor: theme.pillActiveBg }]
                      : styles.primaryAction
                  }
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


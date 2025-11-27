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
};

export function HistoryTab({ restaurantId, theme, isDark }: HistoryTabProps) {
  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'today' | '7d'>('today');
  const [search, setSearch] = useState('');
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
                      {item.status === 'completed' ? 'Terminée' : 'Annulée'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.historyMeta, { color: theme.textSecondary }]}>
                  {historySubtitle(item)}
                </Text>
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


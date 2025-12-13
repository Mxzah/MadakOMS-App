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
  const [search, setSearch] = useState('');
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<KitchenOrder | null>(null);

  const fetchHistory = useCallback(async () => {
    // Récupérer les heures d'ouverture du restaurant
    const { data: settingsData } = await supabase
      .from('restaurant_settings')
      .select('hours_json')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    // Par défaut, utiliser minuit comme début de journée
    let startOfWorkday = new Date();
    startOfWorkday.setHours(0, 0, 0, 0);

    if (settingsData?.hours_json) {
      const hoursJson = settingsData.hours_json as any;
      
      // Obtenir les infos du jour actuel et de la veille
      const todayName = days[now.getDay()];
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayName = days[yesterday.getDay()];
      
      const todayHours = hoursJson[todayName];
      const yesterdayHours = hoursJson[yesterdayName];

      // Vérifier si on est dans la période "après minuit" de la veille
      let isInYesterdayShift = false;
      
      if (yesterdayHours?.close) {
        const [closeHour, closeMinute = 0] = yesterdayHours.close.split(':').map(Number);
        
        // Si l'heure de fermeture de la veille est après minuit (ex: 02:00)
        // et qu'on est actuellement avant cette heure
        if (closeHour < 12) { // Fermeture avant midi = probablement après minuit
          const closeTimeInMinutes = closeHour * 60 + closeMinute;
          const currentTimeInMinutes = currentHour * 60 + currentMinutes;
          
          if (currentTimeInMinutes < closeTimeInMinutes) {
            // On est encore dans le "shift" de la veille
            isInYesterdayShift = true;
          }
        }
      }

      if (isInYesterdayShift && yesterdayHours?.open) {
        // Utiliser l'heure d'ouverture de la veille
        const [openHour, openMinute = 0] = yesterdayHours.open.split(':').map(Number);
        startOfWorkday = new Date(yesterday);
        startOfWorkday.setHours(openHour, openMinute, 0, 0);
      } else if (todayHours?.open) {
        // Utiliser l'heure d'ouverture d'aujourd'hui
        const [openHour, openMinute = 0] = todayHours.open.split(':').map(Number);
        startOfWorkday = new Date(now);
        startOfWorkday.setHours(openHour, openMinute, 0, 0);
        
        // Si on est avant l'heure d'ouverture d'aujourd'hui, utiliser la veille
        if (now < startOfWorkday && yesterdayHours?.open) {
          const [yOpenHour, yOpenMinute = 0] = yesterdayHours.open.split(':').map(Number);
          startOfWorkday = new Date(yesterday);
          startOfWorkday.setHours(yOpenHour, yOpenMinute, 0, 0);
        }
      }
    }

    const startDateISO = startOfWorkday.toISOString();

    // Statuts à afficher dans l'historique
    const historyStatuses = ['failed', 'assigned', 'completed', 'enroute', 'cancelled'];

    // Récupérer directement les commandes avec les statuts souhaités
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(
        `
          id,
          order_number,
          restaurant_id,
          status,
          fulfillment,
          placed_at,
          updated_at,
          completed_at,
          cancelled_at,
          cook_id,
          cook:staff_users!cook_id (
            username
          )
        `
      )
      .eq('restaurant_id', restaurantId)
      .in('status', historyStatuses)
      .gte('placed_at', startDateISO)
      .order('updated_at', { ascending: false });

    if (ordersError) {
      Alert.alert('Erreur', 'Impossible de charger l\'historique.');
      return;
    }

    // Mapper les commandes
    const mapped: HistoryOrder[] = (ordersData ?? [])
      .filter((order: any) => {
        // En mode "Individuel", on filtre par cook_id
        if (kitchenMode === 'individual' && order.cook_id !== staffUserId) return false;
        return true;
      })
      .map((order: any) => {
        const cookInfo = Array.isArray(order.cook) ? order.cook[0] : order.cook;
        return {
          id: order.id,
          orderNumber: order.order_number ?? null,
          status: order.status,
          fulfillment: order.fulfillment,
          updatedAt: order.updated_at,
          completedAt: order.completed_at,
          cancelledAt: order.cancelled_at,
          placedAt: order.placed_at,
          cookName: cookInfo?.username ?? null,
        };
      });

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
    // Filtrer par recherche seulement (le filtre par date est déjà fait dans la requête)
    return history.filter((order) => {
      const matchesSearch = search
        ? `${order.orderNumber ?? ''}`.toLowerCase().includes(search.toLowerCase())
        : true;
      return matchesSearch;
    });
  }, [history, search]);

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
                      {item.status === 'completed' ? 'Complétée' :
                       item.status === 'cancelled' ? 'Annulée' :
                       item.status === 'failed' ? 'Échouée' :
                       item.status === 'assigned' ? 'Assignée' :
                       item.status === 'enroute' ? 'En route' : item.status}
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
                  {detail.status === 'completed' ? 'Complétée' :
                   detail.status === 'cancelled' ? 'Annulée' :
                   detail.status === 'failed' ? 'Échouée' :
                   detail.status === 'assigned' ? 'Assignée' :
                   detail.status === 'enroute' ? 'En route' : detail.status}
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


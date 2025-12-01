import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { KitchenOrder } from '../../../types/orders';
import { formatDateTime, getCustomerName } from '../../../utils/orderHelpers';
import { colors } from '../../kitchen/constants';
import type { DateFilterId, FulfillmentFilterId } from '../types';
import { styles } from '../styles';

type OrdersTabProps = {
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  dateFilter: DateFilterId;
  setDateFilter: (value: DateFilterId) => void;
  fulfillmentFilter: FulfillmentFilterId;
  setFulfillmentFilter: (value: FulfillmentFilterId) => void;
  grouped: Array<{ id: string; label: string; orders: KitchenOrder[] }>;
  onOrderSelect: (order: KitchenOrder) => void;
};

export function OrdersTab({
  loading,
  search,
  setSearch,
  dateFilter,
  setDateFilter,
  fulfillmentFilter,
  setFulfillmentFilter,
  grouped,
  onOrderSelect,
}: OrdersTabProps) {
  return (
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
                    onPress={() => onOrderSelect(order)}
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
  );
}


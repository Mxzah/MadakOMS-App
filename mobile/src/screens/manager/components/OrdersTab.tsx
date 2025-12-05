import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { KitchenOrder } from '../../../types/orders';
import { formatDateTime, formatOrderStatusDisplay, getCustomerName } from '../../../utils/orderHelpers';
import { colors } from '../../kitchen/constants';
import type { DateFilterId, FulfillmentFilterId } from '../types';
import { styles } from '../styles';
import type { KitchenTheme } from '../../kitchen/types';

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
  theme?: KitchenTheme;
  isDark?: boolean;
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
  theme,
  isDark = false,
}: OrdersTabProps) {
  // Utiliser le thème par défaut si non fourni
  const currentTheme = theme || {
    background: colors.background,
    surface: colors.surface,
    surfaceMuted: '#F6F7FB',
    textPrimary: colors.dark,
    textSecondary: colors.muted,
    border: colors.border,
    pillActiveBg: colors.accent,
    pillActiveText: '#FFFFFF',
  };

  return (
    <>
      <View style={styles.filtersRow}>
        <View style={[styles.segmented, { backgroundColor: currentTheme.surfaceMuted }]}>
          {(['today', 'yesterday', 'week', 'month'] as DateFilterId[]).map((id) => {
            const isActive = dateFilter === id;
            return (
              <TouchableOpacity
                key={id}
                style={[
                  styles.segment,
                  isActive && { ...styles.segmentActive, backgroundColor: currentTheme.pillActiveBg },
                ]}
                onPress={() => setDateFilter(id)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: isActive ? currentTheme.pillActiveText : currentTheme.textSecondary },
                    isActive && styles.segmentTextActive,
                  ]}
                >
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

        <View style={[styles.segmented, { backgroundColor: currentTheme.surfaceMuted }]}>
          {(['all', 'pickup', 'delivery'] as FulfillmentFilterId[]).map((id) => {
            const isActive = fulfillmentFilter === id;
            return (
              <TouchableOpacity
                key={id}
                style={[
                  styles.segmentSmall,
                  isActive && { ...styles.segmentActive, backgroundColor: currentTheme.pillActiveBg },
                ]}
                onPress={() => setFulfillmentFilter(id)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: isActive ? currentTheme.pillActiveText : currentTheme.textSecondary },
                    isActive && styles.segmentTextActive,
                  ]}
                >
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
          placeholderTextColor={currentTheme.textSecondary}
          style={[
            styles.searchInput,
            {
              backgroundColor: currentTheme.surface,
              borderColor: currentTheme.border,
              color: currentTheme.textPrimary,
            },
          ]}
          keyboardType="numeric"
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={currentTheme.pillActiveBg} />
        </View>
      ) : (
        <ScrollView
          style={[styles.scroll, { backgroundColor: currentTheme.background }]}
          contentContainerStyle={styles.scrollContent}
        >
          {grouped.map((section) => (
            <View
              key={section.id}
              style={[styles.sectionCard, { backgroundColor: currentTheme.surface }]}
            >
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: currentTheme.textPrimary }]}>
                  {section.label}
                </Text>
                <Text style={[styles.sectionCount, { color: currentTheme.textSecondary }]}>
                  {section.orders.length}
                </Text>
              </View>

              {section.orders.length === 0 ? (
                <Text style={[styles.sectionEmpty, { color: currentTheme.textSecondary }]}>
                  Aucune commande
                </Text>
              ) : (
                section.orders.map((order) => (
                  <TouchableOpacity
                    key={order.id}
                    style={[
                      styles.orderRow,
                      { borderTopColor: currentTheme.border },
                    ]}
                    onPress={() => onOrderSelect(order)}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.orderTitle, { color: currentTheme.textPrimary }]}>
                        #{order.orderNumber ?? '—'} ·{' '}
                        {order.fulfillment === 'delivery' ? 'Livraison' : 'À emporter'}
                      </Text>
                      <Text style={[styles.orderMeta, { color: currentTheme.textSecondary }]}>
                        {getCustomerName(order)} · Placée {formatDateTime(order.placedAt)}
                      </Text>
                    </View>
                    <Text style={[styles.orderStatus, { color: currentTheme.textSecondary }]}>
                      {formatOrderStatusDisplay(order)}
                    </Text>
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


import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAnalytics } from '../hooks/useAnalytics';
import { colors } from '../../kitchen/constants';
import { styles } from '../styles';

type AnalyticsTabProps = {
  restaurantId: string;
};

type DateRange = 'week' | 'month' | 'year' | 'custom';

export function AnalyticsTab({ restaurantId }: AnalyticsTabProps) {
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [showAllTopItems, setShowAllTopItems] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<Date>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // Par défaut, 30 jours en arrière
    return date;
  });
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [pickingStartDate, setPickingStartDate] = useState(true);

  const { analytics, loading, refetch } = useAnalytics(
    restaurantId,
    dateRange,
    dateRange === 'custom' ? customStartDate : undefined,
    dateRange === 'custom' ? customEndDate : undefined
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-CA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatWeek = (weekKey: string) => {
    // weekKey is "YYYY-MM-DD" (Monday of the week)
    // Ajouter 1 jour à la date de début et à la date de fin pour l'affichage UI seulement
    const date = new Date(weekKey);
    date.setDate(date.getDate() + 1); // +1 jour à la date de début
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 6); // +6 jours pour obtenir le dimanche
    return `${formatDate(date.toISOString().split('T')[0])} - ${formatDate(endDate.toISOString().split('T')[0])}`;
  };

  const exportToCSV = useCallback(async () => {
    try {
      // Fonction pour échapper les valeurs CSV (gère les guillemets, virgules, retours à la ligne, accents)
      const escapeCSVValue = (value: string | number | null | undefined): string => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        // Toujours entourer de guillemets pour garantir la compatibilité avec Excel et les accents
        // Échapper les guillemets en les doublant
        return `"${str.replace(/"/g, '""')}"`;
      };

      const headers = [
        'No. commande',
        'Date',
        'Statut',
        'Type',
        'Sous-total',
        'Frais de livraison',
        'Pourboire',
        'Taxes',
        'Total',
        'Chauffeur',
        'Cuisinier',
      ];
      const rows = analytics.orders.map((order) => [
        order.orderNumber?.toString() || '',
        formatDate(order.placedAt),
        order.status,
        order.fulfillment === 'delivery' ? 'Livraison' : 'Cueillette',
        order.subtotal.toFixed(2),
        order.deliveryFee.toFixed(2),
        order.tipAmount.toFixed(2),
        order.taxes.toFixed(2),
        order.total.toFixed(2),
        order.driverName || '',
        order.cookName || '',
      ]);

      // Calculer les totaux pour chaque colonne numérique
      const totals = [
        'TOTAL',
        '',
        '',
        '',
        analytics.revenue.subtotal.toFixed(2),
        analytics.revenue.deliveryFees.toFixed(2),
        analytics.revenue.tips.toFixed(2),
        analytics.revenue.taxes.toFixed(2),
        analytics.revenue.total.toFixed(2),
        '',
        '',
      ];

      // Créer le contenu CSV avec BOM UTF-8 pour Excel et échapper correctement les valeurs
      const csvRows = [
        headers.map(escapeCSVValue).join(','),
        ...rows.map((row) => row.map(escapeCSVValue).join(',')),
        totals.map(escapeCSVValue).join(','),
      ];
      const csvContent = '\uFEFF' + csvRows.join('\r\n');

      // Générer un nom de fichier avec la date
      let fileName: string;
      if (dateRange === 'custom') {
        const startStr = customStartDate.toISOString().split('T')[0];
        const endStr = customEndDate.toISOString().split('T')[0];
        fileName = `analytics_${startStr}_${endStr}.csv`;
      } else {
        const dateStr = new Date().toISOString().split('T')[0];
        const rangeStr = dateRange === 'week' ? 'semaine' : dateRange === 'month' ? 'mois' : 'annee';
        fileName = `analytics_${rangeStr}_${dateStr}.csv`;
      }
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      // Écrire le fichier (UTF-8 par défaut)
      await FileSystem.writeAsStringAsync(fileUri, csvContent);

      // Vérifier si le partage est disponible et partager le fichier
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exporter les données CSV',
        });
      } else {
        Alert.alert(
          'Fichier créé',
          `Le fichier CSV a été créé : ${fileName}\n\nEmplacement : ${fileUri}\n\nLe partage n'est pas disponible sur cet appareil.`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.warn(error);
      Alert.alert('Erreur', 'Impossible d\'exporter les données. Veuillez réessayer.');
    }
  }, [analytics.orders, dateRange, customStartDate, customEndDate]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const maxHourlyCount = Math.max(...analytics.hourlyStats.map((h) => h.count), 1);
  const maxHourlyRevenue = Math.max(...analytics.hourlyStats.map((h) => h.revenue), 1);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      {/* Date Range Selector */}
      <View style={styles.segmented}>
        {(['week', 'month', 'year', 'custom'] as DateRange[]).map((range) => {
          const isActive = dateRange === range;
          return (
            <TouchableOpacity
              key={range}
              style={[styles.segment, isActive && styles.segmentActive]}
              onPress={() => {
                if (range === 'custom') {
                  setShowDatePicker(true);
                  setPickingStartDate(true);
                } else {
                  setDateRange(range);
                }
              }}
            >
              <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                {range === 'week'
                  ? 'Semaine'
                  : range === 'month'
                  ? 'Mois'
                  : range === 'year'
                  ? 'Année'
                  : 'Personnalisé'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Afficher la période personnalisée si sélectionnée */}
      {dateRange === 'custom' && (
        <View
          style={{
            backgroundColor: '#EFF6FF',
            padding: 12,
            borderRadius: 12,
            marginTop: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Période sélectionnée :</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.dark }}>
            {formatDate(customStartDate.toISOString())} - {formatDate(customEndDate.toISOString())}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setShowDatePicker(true);
              setPickingStartDate(true);
            }}
            style={{ marginTop: 8 }}
          >
            <Text style={{ fontSize: 12, color: colors.accent, fontWeight: '600' }}>Modifier la période</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Export Button */}
      <TouchableOpacity
        style={{
          backgroundColor: colors.accent,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 12,
          alignItems: 'center',
          marginTop: 12,
        }}
        onPress={exportToCSV}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 14 }}>Exporter CSV</Text>
      </TouchableOpacity>

      {/* Revenue Summary */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Revenus totaux</Text>
        <View style={{ marginTop: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.dark }}>
              {formatCurrency(analytics.revenue.total)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <View>
              <Text style={{ fontSize: 12, color: colors.muted }}>À emporter</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.dark }}>
                {formatCurrency(analytics.revenue.pickup)}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 12, color: colors.muted }}>Livraison</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.dark }}>
                {formatCurrency(analytics.revenue.delivery)}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>Sous-total</Text>
              <Text style={{ fontSize: 12, color: colors.dark }}>{formatCurrency(analytics.revenue.subtotal)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>Frais de livraison</Text>
              <Text style={{ fontSize: 12, color: colors.dark }}>
                {formatCurrency(analytics.revenue.deliveryFees)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>Pourboires</Text>
              <Text style={{ fontSize: 12, color: colors.dark }}>{formatCurrency(analytics.revenue.tips)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>Taxes</Text>
              <Text style={{ fontSize: 12, color: colors.dark }}>{formatCurrency(analytics.revenue.taxes)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Orders by Day */}
      {analytics.ordersByDay.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Commandes par jour</Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            {analytics.ordersByDay.slice(-7).map((day) => (
              <View key={day.date} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.dark }}>{formatDate(day.date)}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{day.count} commande{day.count > 1 ? 's' : ''}</Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>
                  {formatCurrency(day.revenue)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Orders by Week */}
      {analytics.ordersByWeek.length > 0 && dateRange !== 'week' && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Commandes par semaine</Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            {analytics.ordersByWeek.slice(-4).map((week) => (
              <View key={week.week} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.dark }}>{formatWeek(week.week)}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{week.count} commande{week.count > 1 ? 's' : ''}</Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>
                  {formatCurrency(week.revenue)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Top Items */}
      {analytics.topItems.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Articles les plus vendus</Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            {(showAllTopItems ? analytics.topItems : analytics.topItems.slice(0, 3)).map((item, index) => (
              <View key={`${item.menuItemId || item.name}-${index}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.dark }}>{item.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{item.quantity} vendu{item.quantity > 1 ? 's' : ''}</Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>
                  {formatCurrency(item.revenue)}
                </Text>
              </View>
            ))}
          </View>
          {analytics.topItems.length > 3 && (
            <TouchableOpacity
              onPress={() => setShowAllTopItems(!showAllTopItems)}
              style={{
                marginTop: 12,
                paddingVertical: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>
                {showAllTopItems ? 'Afficher moins' : 'Afficher plus'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Cancelled/Failed Stats */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Commandes annulées/échouées</Text>
        <View style={{ marginTop: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: colors.dark }}>Annulées</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#B91C1C' }}>{analytics.cancelledFailed.cancelled}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: colors.dark }}>Échouées</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#B91C1C' }}>{analytics.cancelledFailed.failed}</Text>
          </View>
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.dark }}>Total</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.dark }}>
                {analytics.cancelledFailed.total}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>Taux d'annulation</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>
                {analytics.cancelledFailed.cancellationRate.toFixed(1)}%
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Hourly Heatmap */}
      {analytics.hourlyStats.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Heures d'affluence</Text>
          <View style={{ marginTop: 12, gap: 6 }}>
            {analytics.hourlyStats.map((hour) => {
              const intensity = hour.count / maxHourlyCount;
              const barWidthPercent = Math.max(intensity * 100, 5);
              return (
                <View key={hour.hour} style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: colors.dark, width: 40 }}>
                      {String(hour.hour).padStart(2, '0')}h
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted, flex: 1, textAlign: 'right' }}>
                      {hour.count} commande{hour.count > 1 ? 's' : ''} · {formatCurrency(hour.revenue)}
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 20,
                      backgroundColor: colors.border,
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        height: '100%',
                        width: `${barWidthPercent}%`,
                        backgroundColor: colors.accent,
                        opacity: 0.3 + intensity * 0.7,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Driver Performance */}
      {analytics.driverPerformance.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Performance des chauffeurs</Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            {analytics.driverPerformance.map((driver) => (
              <View key={driver.driverId} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.dark }}>{driver.driverName}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>
                    {driver.ordersCompleted} commande{driver.ordersCompleted > 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Pourboires totaux</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.dark }}>
                    {formatCurrency(driver.totalTips)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Pourboire moyen</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.dark }}>
                    {formatCurrency(driver.averageTip)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Modal de sélection de dates */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'flex-end',
          }}
          onPress={() => setShowDatePicker(false)}
        >
          <Pressable
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.dark, marginBottom: 16 }}>
              {pickingStartDate ? 'Sélectionner la date de début' : 'Sélectionner la date de fin'}
            </Text>

            <DateTimePicker
              value={pickingStartDate ? customStartDate : customEndDate}
              mode="date"
              display="spinner"
              onChange={(event, selectedDate) => {
                if (selectedDate) {
                  if (pickingStartDate) {
                    setCustomStartDate(selectedDate);
                    if (selectedDate > customEndDate) {
                      setCustomEndDate(selectedDate);
                    }
                    setPickingStartDate(false);
                  } else {
                    if (selectedDate >= customStartDate) {
                      setCustomEndDate(selectedDate);
                      setShowDatePicker(false);
                      setDateRange('custom');
                    } else {
                      Alert.alert('Erreur', 'La date de fin doit être après la date de début.');
                    }
                  }
                }
              }}
              maximumDate={new Date()}
            />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: colors.border,
                  alignItems: 'center',
                }}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.dark }}>Annuler</Text>
              </TouchableOpacity>
              {!pickingStartDate && (
                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: colors.accent,
                    alignItems: 'center',
                  }}
                  onPress={() => {
                    if (customEndDate >= customStartDate) {
                      setShowDatePicker(false);
                      setDateRange('custom');
                    } else {
                      Alert.alert('Erreur', 'La date de fin doit être après la date de début.');
                    }
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Confirmer</Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}


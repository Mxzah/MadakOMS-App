import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { useAudioPlayer } from 'expo-audio';
import { Vibration } from 'react-native';

import { supabase } from '../lib/supabase';
import { AssignedOrder, AvailableOrder } from '../types/orders';
import {
  ORDER_DETAIL_SELECT,
  deriveDistance,
  deriveEta,
  formatAddress,
  formatDateTime,
  getCityFromAddress,
} from '../utils/orderHelpers';

const lightColors = {
  background: '#F5F6FB',
  surface: '#FFFFFF',
  dark: '#1B1C1F',
  muted: '#6B7280',
  border: '#E5E7EB',
  accent: '#2563EB',
};

const darkColors = {
  background: '#0B1120',
  surface: '#111827',
  dark: '#F8FAFC',
  muted: '#94A3B8',
  border: '#1F2937',
  accent: '#2563EB',
};

const NEW_ORDER_SOUND_URL = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

const DELIVERY_STATUSES = [
  { id: 'assigned', label: 'Assignée' },
  { id: 'ready', label: 'Prête' },
  { id: 'pickup', label: 'Ramasser au resto' },
  { id: 'enroute', label: 'En route' },
  { id: 'completed', label: 'Livrée' },
  { id: 'failed', label: 'Échec' },
  { id: 'cancelled', label: 'Annulée' },
] as const;

const AVERAGE_SPEED_KMH = 32;

type Palette = typeof lightColors;
const basePalette = lightColors;
type Coordinates = { lat: number; lng: number };
type HistoryEntry = {
  id: string;
  orderNumber: number | null;
  status: AssignedOrder['status'];
  timestamp: string;
  failureReason?: string | null;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const haversineDistanceKm = (origin: Coordinates, destination: Coordinates) => {
  const R = 6371;
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const deltaLat = toRadians(destination.lat - origin.lat);
  const deltaLng = toRadians(destination.lng - origin.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const computeEtaLabel = (
  driverLocation: Coordinates | null,
  destination: Coordinates | null,
  fallbackMinutes: string
) => {
  if (!driverLocation || !destination) {
    return fallbackMinutes;
  }
  const distance = haversineDistanceKm(driverLocation, destination);
  const minutes = Math.max(1, Math.round((distance / AVERAGE_SPEED_KMH) * 60));
  return `${minutes} min`;
};

const computeDistanceLabel = (
  driverLocation: Coordinates | null,
  destination: Coordinates | null,
  fallback: string
) => {
  if (!driverLocation || !destination) {
    return fallback;
  }
  const distance = haversineDistanceKm(driverLocation, destination);
  return `${distance.toFixed(1)} km`;
};

const extractDestinationCoords = (deliveryAddress: any): Coordinates | null => {
  if (!deliveryAddress) {
    return null;
  }
  const lat = Number(deliveryAddress.lat ?? deliveryAddress.latitude);
  const lng = Number(deliveryAddress.lng ?? deliveryAddress.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
};

const historyStatusLabel = (status: AssignedOrder['status']) => {
  switch (status) {
    case 'completed':
      return 'Terminée';
    case 'failed':
      return 'Échec';
    case 'cancelled':
      return 'Annulée';
    default:
      return status;
  }
};

const historyStatusStyle = (status: AssignedOrder['status']) => {
  switch (status) {
    case 'completed':
      return { backgroundColor: '#DCFCE7', color: '#15803D' };
    case 'failed':
      return { backgroundColor: '#FEE2E2', color: '#B91C1C' };
    case 'cancelled':
      return { backgroundColor: '#FFE4E6', color: '#BE123C' };
    default:
      return { backgroundColor: '#E0E7FF', color: '#312E81' };
  }
};

type DeliveryViewProps = {
  staff: {
    restaurantId: string;
    restaurantName: string;
    staffUserId: string;
  };
  onLogout: () => void;
};

export function DeliveryView({ staff, onLogout }: DeliveryViewProps) {
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const [activeOrders, setActiveOrders] = useState<AssignedOrder[]>([]);
  const [previewOrder, setPreviewOrder] = useState<AssignedOrder | null>(null);
  const [availableOrders, setAvailableOrders] = useState<AvailableOrder[]>([]);
  const [availableLoading, setAvailableLoading] = useState(true);
  const [deliveryTab, setDeliveryTab] = useState<'current' | 'available' | 'history' | 'settings'>(
    'current'
  );
  const [previewItems, setPreviewItems] = useState<
    Array<{
      id: string;
      name: string;
      quantity: number;
      modifiers?: Array<{ modifier_name: string; option_name: string }>;
    }>
  >([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [driverLocation, setDriverLocation] = useState<Coordinates | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const [failureOrder, setFailureOrder] = useState<AssignedOrder | null>(null);
  const [failureReason, setFailureReason] = useState('');
  const [historyOrders, setHistoryOrders] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [settings, setSettings] = useState({
    soundEnabled: true,
    gpsTracking: true,
    theme: 'light' as 'light' | 'dark',
  });
  const palette: Palette = settings.theme === 'dark' ? darkColors : lightColors;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const availableIdsRef = useRef<Set<string>>(new Set());
  const availableSoundPlayer = useAudioPlayer(NEW_ORDER_SOUND_URL, { downloadFirst: true });

  const openMaps = useCallback((address: string) => {
    if (!address) {
      return;
    }
    const encoded = encodeURIComponent(address);
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${encoded}`
        : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Erreur', 'Impossible d’ouvrir l’application de navigation.');
    });
  }, []);

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

  const mapAvailableOrder = useCallback(
    (row: any) => {
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
      const destinationCoords = extractDestinationCoords(row.delivery_address);
      const fallbackDistance = deriveDistance(orderNumber);
      const fallbackEta = deriveEta(orderNumber);

    return {
      id: row.id,
      orderNumber,
      city: cityLabel,
      streetLabel,
      address: addressText || streetLabel,
        distance: computeDistanceLabel(driverLocation, destinationCoords, fallbackDistance),
        eta: computeEtaLabel(driverLocation, destinationCoords, fallbackEta),
      status: (row.status as AssignedOrder['status']) ?? 'ready',
      customerName: row.customer?.first_name ?? null,
      customerPhone: row.customer?.phone ?? null,
      customerEmail: row.customer?.email ?? null,
    };
    },
    [driverLocation]
  );

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
      const readyOrders = normalized.filter((candidate) => candidate.status === 'ready');
      const nextIds = new Set(readyOrders.map((order) => order.id));

      const hasNew =
        readyOrders.length > 0 &&
        readyOrders.some((order) => !availableIdsRef.current.has(order.id));

      if (hasNew) {
        if (settings.soundEnabled && availableSoundPlayer) {
          await availableSoundPlayer.seekTo(0);
          availableSoundPlayer.play();
        } else {
          Vibration.vibrate(300);
        }
      }

      availableIdsRef.current = nextIds;
      setAvailableOrders(readyOrders);
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
  }, [availableSoundPlayer, mapAvailableOrder, settings.soundEnabled, staff.restaurantId]);

  const fetchActiveOrders = useCallback(async () => {
    const { data, error } = await supabase
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
        .eq('driver_id', staff.staffUserId)
        .in('status', ['assigned', 'enroute'])
      .order('placed_at', { ascending: true });

    if (error) {
      console.warn(error);
      return;
    }

    const mapped =
      data?.map((row: any) => {
        const customerInfo = Array.isArray(row.customers) ? row.customers[0] : row.customers;
        const orderNumber = Number(row.order_number ?? 0);
        const destinationCoords = extractDestinationCoords(row.delivery_address);
        const fallbackDistance = deriveDistance(orderNumber);
        const fallbackEta = deriveEta(orderNumber);

        return {
          id: row.id,
          orderNumber: row.order_number,
          restaurantName: staff.restaurantName,
          customerName: customerInfo?.first_name ?? null,
          customerPhone: customerInfo?.phone ?? null,
          customerEmail: customerInfo?.email ?? null,
          customerAddress: row.delivery_address?.address ?? 'Adresse à confirmer',
          itemsSummary: 'Détails disponibles après assignation',
          fulfillment: 'delivery',
          paymentInfo: 'paid_online',
          eta: computeEtaLabel(driverLocation, destinationCoords, fallbackEta),
          distance: computeDistanceLabel(driverLocation, destinationCoords, fallbackDistance),
          status: row.status as AssignedOrder['status'],
        } as AssignedOrder;
      }) ?? [];

    setActiveOrders(mapped);
  }, [driverLocation, staff.restaurantId, staff.restaurantName, staff.staffUserId]);

  useEffect(() => {
    fetchAvailableOrders();
    fetchActiveOrders();
    const interval = setInterval(() => {
      fetchAvailableOrders();
      fetchActiveOrders();
    }, 20000);

    return () => clearInterval(interval);
  }, [fetchAvailableOrders, fetchActiveOrders]);

  const fetchDriverLocation = useCallback(async () => {
    const { data, error } = await supabase
      .from('driver_locations')
      .select('lat,lng')
      .eq('staff_id', staff.staffUserId)
      .maybeSingle();

    if (!error && data && data.lat !== null && data.lng !== null) {
      const lat = Number(data.lat);
      const lng = Number(data.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setDriverLocation({ lat, lng });
      }
    }
  }, [staff.staffUserId]);

  const upsertDriverLocation = useCallback(
    async (coords: Coordinates) => {
      try {
        await supabase.from('driver_locations').upsert({
          staff_id: staff.staffUserId,
          lat: coords.lat,
          lng: coords.lng,
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Driver location update failed', err);
      }
    },
    [staff.staffUserId]
  );

  useEffect(() => {
    fetchDriverLocation();
    const interval = setInterval(fetchDriverLocation, 15000);
    return () => clearInterval(interval);
  }, [fetchDriverLocation]);

  const fetchHistoryOrders = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          id,
          order_number,
          status,
          updated_at,
          completed_at,
          cancelled_at,
          failure_reason
        `
        )
        .eq('restaurant_id', staff.restaurantId)
        .eq('driver_id', staff.staffUserId)
        .in('status', ['completed', 'cancelled', 'failed'])
        .order('updated_at', { ascending: false });

      if (error) {
        throw error;
      }

      const mapped: HistoryEntry[] =
        data?.map((row: any) => ({
          id: row.id,
          orderNumber: row.order_number ?? null,
          status: row.status as AssignedOrder['status'],
          timestamp: row.completed_at ?? row.cancelled_at ?? row.updated_at,
          failureReason: row.failure_reason ?? null,
        })) ?? [];

      setHistoryOrders(mapped);
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Impossible de charger l’historique.'
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [staff.restaurantId]);

  useEffect(() => {
    fetchHistoryOrders();
  }, [fetchHistoryOrders]);

  useEffect(() => {
    let isMounted = true;

    const startTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== Location.PermissionStatus.GRANTED) {
          return;
        }
        locationWatchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000,
            distanceInterval: 50,
          },
          (position) => {
            if (!isMounted) {
              return;
            }
            const coords = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            setDriverLocation(coords);
            upsertDriverLocation(coords);
          }
        );
      } catch (err) {
        console.warn('Impossible de suivre la position', err);
      }
    };

    if (settings.gpsTracking) {
      startTracking();
    }

    return () => {
      isMounted = false;
      locationWatchRef.current?.remove();
      locationWatchRef.current = null;
    };
  }, [settings.gpsTracking, upsertDriverLocation]);

  const handleAcceptOrder = async (candidate: AvailableOrder) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'assigned', driver_id: staff.staffUserId })
        .eq('id', candidate.id);

      if (error) {
        throw error;
      }

      setAvailableOrders((list) => list.filter((item) => item.id !== candidate.id));
      setDeliveryTab('current');
      setPreviewOrder(null);
      fetchActiveOrders();
      fetchAvailableOrders();
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Impossible d’accepter la commande.'
      );
    }
  };

  const handleUpdateActiveOrderStatus = useCallback(
    async (
      orderId: string,
      status: AssignedOrder['status'],
      extraFields?: Record<string, any>
    ) => {
      try {
        const payload: Record<string, any> = { status, ...(extraFields ?? {}) };
        const { error } = await supabase.from('orders').update(payload).eq('id', orderId);
        if (error) {
          throw error;
        }
        fetchActiveOrders();
        fetchAvailableOrders();
        fetchHistoryOrders();
      } catch (err) {
        Alert.alert(
          'Erreur',
          err instanceof Error ? err.message : 'Impossible de mettre à jour la commande.'
        );
      }
    },
    [fetchActiveOrders, fetchAvailableOrders, fetchHistoryOrders]
  );

  const handleConfirmFailure = useCallback(async () => {
    if (!failureOrder) {
      return;
    }
    const trimmed = failureReason.trim();
    if (!trimmed) {
      Alert.alert('Motif requis', 'Veuillez expliquer pourquoi la livraison a échoué.');
      return;
    }
    await handleUpdateActiveOrderStatus(failureOrder.id, 'failed', {
      failure_reason: trimmed,
    });
    setFailureOrder(null);
    setFailureReason('');
  }, [failureOrder, failureReason, handleUpdateActiveOrderStatus]);

  const openHistoryDetail = useCallback(
    async (entryId: string) => {
      try {
        setPreviewLoading(true);
        const { data, error } = await supabase
          .from('orders')
          .select(ORDER_DETAIL_SELECT)
          .eq('id', entryId)
          .maybeSingle();

        if (error || !data) {
          throw error ?? new Error('Commande introuvable.');
        }

        const customerRaw = Array.isArray(data.customers) ? data.customers[0] : data.customers;
        const detailItems =
          data.order_items?.map((item: any) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            modifiers: item.order_item_modifiers ?? [],
          })) ?? [];

        setPreviewItems(detailItems);
        setPreviewOrder({
          id: data.id,
          orderNumber: data.order_number ?? null,
          restaurantName: staff.restaurantName,
          customerName: customerRaw?.first_name ?? null,
          customerPhone: customerRaw?.phone ?? null,
          customerEmail: customerRaw?.email ?? null,
          customerAddress:
            data.delivery_address?.address ?? formatAddress(data.delivery_address) ?? 'Adresse à confirmer',
          itemsSummary: 'Historique',
          fulfillment: data.fulfillment,
          paymentInfo: 'paid_online',
          eta: '',
          distance: '',
          status: data.status as AssignedOrder['status'],
        });
      } catch (err) {
        Alert.alert(
          'Erreur',
          err instanceof Error ? err.message : 'Impossible de charger la commande.'
        );
      } finally {
        setPreviewLoading(false);
      }
    },
    [staff.restaurantName]
  );

  const content = useMemo(() => {
    if (deliveryTab === 'current') {
      return activeOrders.length ? (
        <View style={styles.availableList}>
          {activeOrders.map((activeOrder) => (
            <DeliveryCard
              key={activeOrder.id}
              order={activeOrder}
              onNavigate={() => openMaps(activeOrder.customerAddress)}
              onChangeStatus={(nextStatus) => handleUpdateActiveOrderStatus(activeOrder.id, nextStatus)}
              onViewInfo={() => {
                setPreviewOrder(activeOrder);
                setPreviewItems([]);
                fetchOrderItems(activeOrder.id);
              }}
              onReportFailure={(orderToFail) => {
                setFailureOrder(orderToFail);
                setFailureReason('');
              }}
              palette={palette}
              styles={styles}
            />
          ))}
        </View>
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

    if (deliveryTab === 'available') {
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
          styles={styles}
        />
      );
    }

    if (deliveryTab === 'settings') {
      return (
        <View style={styles.settingsList}>
          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Notifications sonores</Text>
                <Text style={styles.settingSubtitle}>
                  Désactivez pour recevoir uniquement une vibration.
                </Text>
              </View>
              <Switch
                value={settings.soundEnabled}
                onValueChange={(value) =>
                  setSettings((prev) => ({ ...prev, soundEnabled: value }))
                }
              />
            </View>
          </View>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Partager la position</Text>
                <Text style={styles.settingSubtitle}>
                  Envoie votre GPS toutes les 30 secondes au restaurant.
                </Text>
              </View>
              <Switch
                value={settings.gpsTracking}
                onValueChange={(value) =>
                  setSettings((prev) => ({ ...prev, gpsTracking: value }))
                }
              />
            </View>
          </View>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Mode sombre</Text>
                <Text style={styles.settingSubtitle}>
                  Adapte les couleurs de l’interface pour la nuit.
                </Text>
              </View>
              <Switch
                value={settings.theme === 'dark'}
                onValueChange={(value) =>
                  setSettings((prev) => ({ ...prev, theme: value ? 'dark' : 'light' }))
                }
              />
            </View>
          </View>

          <View style={styles.settingCard}>
            <Text style={styles.settingTitle}>Version de l’application</Text>
            <Text style={styles.settingSubtitle}>{appVersion}</Text>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
            <Text style={styles.logoutText}>Déconnexion</Text>
          </TouchableOpacity>

        </View>
      );
    }

    if (deliveryTab === 'history' && historyLoading) {
      return (
        <View style={styles.deliveryEmpty}>
          <ActivityIndicator color={palette.accent} />
          <Text style={styles.deliveryEmptySubtitle}>Chargement de l’historique…</Text>
        </View>
      );
    }

    if (deliveryTab === 'history' && historyOrders.length === 0) {
      return (
        <View style={styles.deliveryEmpty}>
          <Text style={styles.deliveryEmptyTitle}>Aucune livraison passée</Text>
          <Text style={styles.deliveryEmptySubtitle}>
            Vos livraisons terminées apparaîtront ici.
          </Text>
        </View>
      );
    }

    if (deliveryTab === 'history') {
      return (
        <View style={styles.historyList}>
          {historyOrders.map((entry) => {
            const badgeStyle = historyStatusStyle(entry.status);
            return (
              <TouchableOpacity
                key={entry.id}
                style={styles.historyCard}
                onPress={() => openHistoryDetail(entry.id)}
              >
                <View style={styles.historyHeader}>
                  <Text style={styles.historyOrderNumber}>Commande #{entry.orderNumber ?? '—'}</Text>
                  <View style={[styles.historyBadge, { backgroundColor: badgeStyle.backgroundColor }]}>
                    <Text style={[styles.historyBadgeText, { color: badgeStyle.color }]}>
                      {historyStatusLabel(entry.status)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.historyMeta}>{formatDateTime(entry.timestamp)}</Text>
                {entry.status === 'failed' && entry.failureReason ? (
                  <Text style={styles.historyFailure}>Motif: {entry.failureReason}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    return (
      <View style={styles.historyList}>
        <Text style={styles.historyMeta}>Sélectionnez un onglet pour voir les données.</Text>
      </View>
    );
  }, [
    activeOrders,
    availableLoading,
    availableOrders,
    deliveryTab,
    fetchOrderItems,
    handleAcceptOrder,
    handleUpdateActiveOrderStatus,
    historyLoading,
    historyOrders,
    openHistoryDetail,
    openMaps,
    onLogout,
    settings.gpsTracking,
    settings.soundEnabled,
    staff.restaurantName,
  ]);

  return (
    <SafeAreaView style={[styles.deliverySafeArea, { backgroundColor: palette.background }]}>
      <View style={styles.deliveryTopBar}>
        <View>
          <Text style={[styles.deliveryTopLabel, { color: palette.muted }]}>Application Livreur</Text>
          <Text style={[styles.deliveryTopValue, { color: palette.dark }]}>{staff.restaurantName}</Text>
        </View>
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
        <TouchableOpacity
          style={[styles.deliveryTabButton, deliveryTab === 'history' && styles.deliveryTabButtonActive]}
          onPress={() => setDeliveryTab('history')}
        >
          <Text
            style={[
              styles.deliveryTabLabel,
              deliveryTab === 'history' && styles.deliveryTabLabelActive,
            ]}
          >
            Historique
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.deliveryTabButton, deliveryTab === 'settings' && styles.deliveryTabButtonActive]}
          onPress={() => setDeliveryTab('settings')}
        >
          <Text
            style={[
              styles.deliveryTabLabel,
              deliveryTab === 'settings' && styles.deliveryTabLabelActive,
            ]}
          >
            Réglages
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
          <Pressable
            style={[styles.modalCard, { backgroundColor: palette.surface }]}
            onPress={(event) => event.stopPropagation()}
          >
            {previewLoading ? (
              <View style={styles.orderEmptyState}>
                <ActivityIndicator color={palette.accent} />
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
                  palette={palette}
                  styles={styles}
                />
              )
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <FailureReasonModal
        visible={Boolean(failureOrder)}
        reason={failureReason}
        onChangeReason={setFailureReason}
        onCancel={() => {
          setFailureOrder(null);
          setFailureReason('');
        }}
        onConfirm={handleConfirmFailure}
        styles={styles}
      />
    </SafeAreaView>
  );
}

function AvailableOrdersList({
  orders,
  loading,
  onAccept,
  onPreview,
  styles,
}: {
  orders: AvailableOrder[];
  loading: boolean;
  onAccept: (order: AvailableOrder) => void;
  onPreview: (order: AvailableOrder) => void;
  styles: DeliveryStyles;
}) {
  if (loading) {
    return (
      <View style={styles.deliveryEmpty}>
        <ActivityIndicator color={basePalette.accent} />
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
  onViewInfo?: () => void;
  onReportFailure?: (order: AssignedOrder) => void;
  items?: Array<{
    id: string;
    name: string;
    quantity: number;
    modifiers?: Array<{ modifier_name: string; option_name: string }>;
  }>;
  palette: Palette;
  styles: DeliveryStyles;
};

function DeliveryCard({
  order,
  onNavigate,
  onChangeStatus,
  onClose,
  forceStatusLabel,
  onViewInfo,
  onReportFailure,
  items,
  palette,
  styles,
}: DeliveryCardProps) {
  const currentStatus =
    DELIVERY_STATUSES.find((status) => status.id === order.status) ?? { label: order.status };
  const cityLabel = getCityFromAddress(order.customerAddress);
  const isPreview = Boolean(onClose);
  const clientName = order.customerName ?? 'Client assigné';
  const clientPhone = order.customerPhone ?? '—';
  const clientEmail = order.customerEmail ?? '—';

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

      {!isPreview && (
        <>
          {onViewInfo && (
            <TouchableOpacity style={styles.availableSecondaryButton} onPress={onViewInfo}>
              <Text style={styles.availableSecondaryButtonText}>Voir les informations</Text>
            </TouchableOpacity>
          )}
          <View style={styles.deliveryActionButtons}>
            {onNavigate && (
              <TouchableOpacity style={styles.availableSecondaryButton} onPress={onNavigate}>
                <Text style={styles.availableSecondaryButtonText}>Itinéraire</Text>
              </TouchableOpacity>
            )}
            {order.status === 'assigned' && (
              <TouchableOpacity
                style={styles.availablePrimaryButton}
            onPress={() => onChangeStatus('enroute')}
              >
                <Text style={styles.availablePrimaryButtonText}>La commande est récupérée</Text>
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
            {order.status === 'enroute' && onReportFailure && (
              <TouchableOpacity
                style={styles.destructiveButton}
                onPress={() => onReportFailure(order)}
              >
                <Text style={styles.destructiveButtonText}>
                  Impossible d’effectuer la livraison
                </Text>
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
        </>
      )}

      {isPreview && (
        <>
          <View
            style={[
              styles.previewSection,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.previewSectionTitle, { color: palette.dark }]}>Client</Text>
            <Text style={[styles.previewSectionValue, { color: palette.dark }]}>{clientName}</Text>
            <Text style={[styles.previewSectionMeta, { color: palette.muted }]}>
              Tél. {clientPhone}
            </Text>
            <Text style={[styles.previewSectionMeta, { color: palette.muted }]}>{clientEmail}</Text>
            <Text style={[styles.previewSectionMeta, { color: palette.muted }]}>
              {order.customerAddress}
            </Text>
          </View>

          <View
            style={[
              styles.previewSection,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.previewSectionTitle, { color: palette.dark }]}>Articles</Text>
            {items && items.length > 0 ? (
              items.map((item) => (
                <View key={item.id} style={styles.previewItemRow}>
                  <Text style={[styles.previewItemTitle, { color: palette.dark }]}>
                    {item.quantity} × {item.name}
                  </Text>
                  {item.modifiers && item.modifiers.length > 0 ? (
                    <Text style={[styles.previewItemMeta, { color: palette.muted }]}>
                      {item.modifiers.map((mod) => mod.option_name).join(', ')}
                    </Text>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={[styles.previewSectionMeta, { color: palette.muted }]}>
                Articles visibles une fois la commande assignée.
              </Text>
            )}
          </View>
        </>
      )}

      {onClose && (
        <TouchableOpacity style={styles.availableSecondaryButton} onPress={onClose}>
          <Text style={styles.availableSecondaryButtonText}>Fermer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

type DeliveryStyles = ReturnType<typeof createStyles>;

function createStyles(palette: Palette) {
  const colors = palette;
  return StyleSheet.create({
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
    textAlign: 'center',
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
    alignSelf: 'stretch',
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
    alignSelf: 'stretch',
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
    flexDirection: 'column',
    gap: 10,
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
  previewSection: {
    marginTop: 16,
    borderRadius: 18,
    padding: 16,
    gap: 6,
    borderWidth: 1,
  },
  previewSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.dark,
  },
  previewSectionValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  previewSectionMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  previewItemRow: {
    marginTop: 8,
    gap: 2,
  },
  previewItemTitle: {
    fontWeight: '600',
    color: colors.dark,
  },
  previewItemMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  historyList: {
    gap: 12,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyOrderNumber: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.dark,
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
    color: colors.muted,
  },
  historyFailure: {
    marginTop: 6,
    color: '#B91C1C',
    fontWeight: '600',
  },
  settingsList: {
    gap: 16,
  },
  settingCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingText: {
    flex: 1,
    paddingRight: 12,
    gap: 4,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
  },
  settingSubtitle: {
    color: colors.muted,
  },
  logoutButton: {
    backgroundColor: '#1F2937',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  logoutText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  destructiveButton: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  destructiveButtonText: {
    color: '#B91C1C',
    fontWeight: '700',
  },
  failureModalCard: {
    backgroundColor: colors.surface,
    margin: 24,
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  failureTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  failureInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    color: colors.dark,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontWeight: '600',
    color: colors.dark,
  },
  confirmButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  failureWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
});
}

type FailureReasonModalProps = {
  visible: boolean;
  reason: string;
  onChangeReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  styles: DeliveryStyles;
};

function FailureReasonModal({
  visible,
  reason,
  onChangeReason,
  onCancel,
  onConfirm,
  styles,
}: FailureReasonModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalBackdrop} onPress={onCancel}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.failureWrapper}
        >
          <Pressable style={styles.failureModalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.failureTitle}>Impossible d’effectuer la livraison</Text>
            <TextInput
              value={reason}
              onChangeText={onChangeReason}
              placeholder="Expliquez le problème..."
              placeholderTextColor={basePalette.muted}
              multiline
              style={styles.failureInput}
            />
            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
                <Text style={styles.confirmButtonText}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}


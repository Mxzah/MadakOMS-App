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
  driverName?: string | null;
  paymentMethod?: string | null;
  tipAmount?: number | null;
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

const translateDropOption = (dropOption: string): string => {
  const lower = dropOption.toLowerCase().trim();
  if (lower === 'door') {
    return 'Laisser à la porte';
  }
  if (lower === 'hand') {
    return 'Remettre en main propre';
  }
  // Retourner la valeur originale si ce n'est pas une valeur connue
  return dropOption;
};

const translatePaymentMethod = (paymentMethod: string): string => {
  const lower = paymentMethod.toLowerCase().trim();
  if (lower === 'card' || lower === 'carte') {
    return 'Carte';
  }
  if (lower === 'card_terminal' || lower === 'terminal de paiement') {
    return 'Terminal de paiement';
  }
  if (lower === 'cash' || lower === 'especes' || lower === 'espèces') {
    return 'Espèces';
  }
  if (lower === 'online' || lower === 'paid_online' || lower === 'payé en ligne') {
    return 'Payé en ligne';
  }
  if (lower === 'pay_on_delivery' || lower === 'paiement à la livraison') {
    return 'Paiement à la livraison';
  }
  if (lower === 'payable à la porte') {
    return 'Payable à la porte';
  }
  if (lower === 'interac') {
    return 'Interac';
  }
  // Retourner la valeur originale si ce n'est pas une valeur connue
  return paymentMethod;
};

const formatHistoryPayment = (paymentMethod: string | null | undefined): string | null => {
  if (!paymentMethod) return null;
  const lower = paymentMethod.toLowerCase().trim();
  if (lower === 'card_online') {
    return 'Payé en ligne';
  }
  if (lower === 'cash' || lower === 'card_terminal' || lower === 'interac') {
    return translatePaymentMethod(paymentMethod);
  }
  return null;
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
  const [historySearch, setHistorySearch] = useState('');
  const [assignOrder, setAssignOrder] = useState<AssignedOrder | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<Array<{ id: string; username: string }>>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [settings, setSettings] = useState({
    soundEnabled: true,
    gpsTracking: true,
    theme: 'light' as 'light' | 'dark',
    deliveryMode: 'team' as 'team' | 'individual' | 'coordinator',
  });
  const palette: Palette = settings.theme === 'dark' ? darkColors : lightColors;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const availableIdsRef = useRef<Set<string>>(new Set());
  const availableSoundPlayer = useAudioPlayer(NEW_ORDER_SOUND_URL, { downloadFirst: true });
  const logOrderEvent = useCallback(
    async (orderId: string, status: string, extraPayload?: Record<string, any>) => {
      try {
        const payload = { status, ...(extraPayload ?? {}) };
        const { error } = await supabase.from('order_events').insert({
          order_id: orderId,
          actor_type: 'delivery',
          actor_id: staff.staffUserId,
          event_type: 'status_changed',
          payload,
        });
        if (error) {
          console.warn('Impossible d’enregistrer le journal des événements', error);
        }
      } catch (err) {
        console.warn('Erreur lors de la création de order_event', err);
      }
    },
    [staff.staffUserId]
  );

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
      scheduledAt: row.scheduled_at ?? null,
      paymentMethod: Array.isArray(row.payments) ? row.payments[0]?.method ?? null : row.payments?.method ?? null,
      tipAmount: row.tip_amount ? Number(row.tip_amount) : null,
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
          'id, order_number, status, delivery_address, scheduled_at, tip_amount, customer:customer_id(first_name, phone, email), payments!order_id(method)'
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
    const statuses = ['assigned', 'enroute'];
    // En mode Coordinateur, on inclut aussi les commandes 'ready' pour pouvoir les assigner
    if (settings.deliveryMode === 'coordinator') {
      statuses.push('ready');
    }

    const query = supabase
      .from('orders')
      .select(
        `
          id,
          order_number,
          delivery_address,
          status,
          driver_id,
          drop_option,
          apartment_suite,
          notes,
          scheduled_at,
          tip_amount,
          payments!order_id (
            method
          ),
          driver:staff_users!driver_id (
            username
          ),
          customers:customer_id (
            first_name,
            phone,
            email
          )
        `
      )
      .eq('restaurant_id', staff.restaurantId)
      .in('status', statuses);

    // En mode Individuel, on filtre par driver_id
    if (settings.deliveryMode === 'individual') {
      query.eq('driver_id', staff.staffUserId);
    }

    const { data, error } = await query.order('placed_at', { ascending: true });

    if (error) {
      console.warn(error);
      return;
    }

    const mapped =
      data?.map((row: any) => {
        const customerInfo = Array.isArray(row.customers) ? row.customers[0] : row.customers;
        const driverInfo = Array.isArray(row.driver) ? row.driver[0] : row.driver;
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
          driverId: row.driver_id ?? null,
          driverName: driverInfo?.username ?? null,
          dropOption: row.drop_option ?? null,
          apartmentSuite: row.apartment_suite ?? null,
          notes: row.notes ?? null,
          scheduledAt: row.scheduled_at ?? null,
          paymentMethod: Array.isArray(row.payments) ? row.payments[0]?.method ?? null : row.payments?.method ?? null,
          tipAmount: row.tip_amount ? Number(row.tip_amount) : null,
        } as AssignedOrder;
      }) ?? [];

    setActiveOrders(mapped);
  }, [driverLocation, staff.restaurantId, staff.restaurantName, staff.staffUserId, settings.deliveryMode]);

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
      // Récupérer les événements de changement de statut vers 'completed', 'cancelled' ou 'failed'
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
            updated_at,
            completed_at,
            cancelled_at,
            failure_reason,
            driver_id,
            tip_amount,
            driver:staff_users!driver_id (
              username
            ),
            payments!order_id (
              method
            )
          )
        `
        )
        .eq('event_type', 'status_changed')
        .order('created_at', { ascending: false });

      if (eventsError) {
        throw eventsError;
      }

      // Filtrer par restaurant_id et gérer les doublons (prendre le dernier événement pour chaque commande)
      const orderMap = new Map<string, any>();
      
      // Date de début de la journée (minuit aujourd'hui)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      eventsData?.forEach((event: any) => {
        const order = Array.isArray(event.orders) ? event.orders[0] : event.orders;
        if (!order || order.restaurant_id !== staff.restaurantId) return;

        const payload = event.payload || {};
        const status = payload.status;

        // Filtrer uniquement les événements avec status 'completed', 'cancelled' ou 'failed'
        if (status !== 'completed' && status !== 'cancelled' && status !== 'failed') return;

        // Filtrer uniquement les événements de la journée
        const eventDate = new Date(event.created_at);
        if (eventDate < todayStart) return;

        // En mode "Individuel", on filtre par driver_id
        if (settings.deliveryMode === 'individual' && order.driver_id !== staff.staffUserId) return;

        const orderId = order.id;

        // Si on n'a pas encore cette commande, ou si cet événement est plus récent, on le garde
        if (!orderMap.has(orderId) || new Date(event.created_at) > new Date(orderMap.get(orderId).eventCreatedAt)) {
          const driverInfo = Array.isArray(order.driver) ? order.driver[0] : order.driver;
          const paymentInfo = Array.isArray(order.payments) ? order.payments[0] : order.payments;
          orderMap.set(orderId, {
            id: order.id,
            orderNumber: order.order_number ?? null,
            status: status as AssignedOrder['status'],
            timestamp: order.completed_at ?? order.cancelled_at ?? order.updated_at,
            failureReason: order.failure_reason ?? payload.failure_reason ?? null,
            driverName: driverInfo?.username ?? null,
            paymentMethod: paymentInfo?.method ?? null,
            tipAmount: order.tip_amount ? Number(order.tip_amount) : null,
            eventCreatedAt: event.created_at,
          });
        }
      });

      const mapped: HistoryEntry[] = Array.from(orderMap.values())
        .map((item) => {
          // Utiliser eventCreatedAt comme timestamp pour le tri et l'affichage
          const { eventCreatedAt, ...rest } = item;
          return {
            ...rest,
            timestamp: eventCreatedAt,
          };
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setHistoryOrders(mapped);
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Impossible de charger l\'historique.'
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [staff.restaurantId, staff.staffUserId, settings.deliveryMode]);

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
    Alert.alert(
      'Accepter la commande',
      `Voulez-vous accepter la commande #${candidate.orderNumber} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Accepter',
          style: 'default',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('orders')
                .update({ status: 'assigned', driver_id: staff.staffUserId })
                .eq('id', candidate.id);

              if (error) {
                throw error;
              }

              await logOrderEvent(candidate.id, 'assigned', { driver_id: staff.staffUserId });

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
          },
        },
      ]
    );
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
        await logOrderEvent(orderId, status, extraFields);
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
    [fetchActiveOrders, fetchAvailableOrders, fetchHistoryOrders, logOrderEvent]
  );

  const fetchAvailableDrivers = useCallback(async () => {
    setLoadingDrivers(true);
    try {
      const { data, error } = await supabase
        .from('staff_users')
        .select('id, username')
        .eq('restaurant_id', staff.restaurantId)
        .eq('role', 'delivery')
        .eq('is_active', true)
        .order('username', { ascending: true });

      if (error) {
        throw error;
      }

      setAvailableDrivers(data ?? []);
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de charger la liste des livreurs.');
    } finally {
      setLoadingDrivers(false);
    }
  }, [staff.restaurantId]);

  const assignOrderToDriver = useCallback(
    async (orderId: string, driverId: string) => {
      const payload = { status: 'assigned', driver_id: driverId };

      const { error } = await supabase.from('orders').update(payload).eq('id', orderId);
      if (error) {
        Alert.alert('Erreur', 'Échec de l\'assignation.');
        return;
      }

      const eventPayload = { status: 'assigned', driver_id: driverId };

      const { error: eventError } = await supabase.from('order_events').insert({
        order_id: orderId,
        actor_type: 'coordinator',
        event_type: 'status_changed',
        payload: eventPayload,
      });

      if (eventError) {
        console.warn('Impossible d\'enregistrer le journal des événements', eventError);
      }

      fetchActiveOrders();
      fetchAvailableOrders();
      setAssignOrder(null);
    },
    [fetchActiveOrders, fetchAvailableOrders]
  );

  const handleStatusChangeWithConfirmation = useCallback(
    (orderId: string, orderNumber: number | null, currentStatus: AssignedOrder['status'], nextStatus: AssignedOrder['status']) => {
      let title = '';
      let message = '';

      switch (nextStatus) {
        case 'enroute':
          if (currentStatus === 'assigned') {
            title = 'Confirmer la récupération';
            message = `Confirmez-vous avoir récupéré la commande #${orderNumber ?? '—'} au restaurant ?`;
          } else if (currentStatus === 'pickup') {
            title = 'Départ vers le client';
            message = `Confirmez-vous le départ vers le client pour la commande #${orderNumber ?? '—'} ?`;
          }
          break;
        case 'completed':
          title = 'Livraison terminée';
          message = `Confirmez-vous que la livraison de la commande #${orderNumber ?? '—'} est terminée ?`;
          break;
        default:
          title = 'Confirmer la modification';
          message = `Voulez-vous vraiment modifier le statut de la commande #${orderNumber ?? '—'} ?`;
      }

      Alert.alert(
        title,
        message,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Confirmer',
            style: 'default',
            onPress: () => handleUpdateActiveOrderStatus(orderId, nextStatus),
          },
        ]
      );
    },
    [handleUpdateActiveOrderStatus]
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
        const dataWithDropInfo = data as any;
        const paymentInfo = Array.isArray(dataWithDropInfo.payments) ? dataWithDropInfo.payments[0] : dataWithDropInfo.payments;
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
          dropOption: dataWithDropInfo.drop_option ?? null,
          apartmentSuite: dataWithDropInfo.apartment_suite ?? null,
          notes: dataWithDropInfo.notes ?? null,
          paymentMethod: paymentInfo?.method ?? null,
          tipAmount: dataWithDropInfo.tip_amount ? Number(dataWithDropInfo.tip_amount) : null,
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
              deliveryMode={settings.deliveryMode}
              onNavigate={() => openMaps(activeOrder.customerAddress)}
              onChangeStatus={(nextStatus) =>
                handleStatusChangeWithConfirmation(
                  activeOrder.id,
                  activeOrder.orderNumber,
                  activeOrder.status,
                  nextStatus
                )
              }
              onViewInfo={() => {
                setPreviewOrder(activeOrder);
                setPreviewItems([]);
                fetchOrderItems(activeOrder.id);
              }}
              onReportFailure={(orderToFail) => {
                setFailureOrder(orderToFail);
                setFailureReason('');
              }}
              onAssign={() => {
                setAssignOrder(activeOrder);
                fetchAvailableDrivers();
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
          deliveryMode={settings.deliveryMode}
          onAccept={handleAcceptOrder}
          onAssign={(candidate) => {
            setAssignOrder({
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
            fetchAvailableDrivers();
          }}
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
              paymentMethod: candidate.paymentMethod ?? null,
              tipAmount: candidate.tipAmount ?? null,
            });
            setPreviewItems([]);
            fetchOrderItems(candidate.id);
          }}
          styles={styles}
        />
      );
    }

    if (deliveryTab === 'settings') {
      const DELIVERY_MODES = [
        {
          id: 'team',
          label: 'Équipe',
          description:
            'Dans "Livraisons actives" et dans "Historique", vous voyez toutes les livraisons avec le nom du livreur en haut à droite.',
        },
        {
          id: 'individual',
          label: 'Individuel',
          description: 'Dans "Livraisons actives" et dans "Historique", vous voyez seulement les livraisons qui vous sont assignées.',
        },
        {
          id: 'coordinator',
          label: 'Coordinateur',
          description:
            'Dans "Livraisons actives" et dans "Historique", vous voyez toutes les livraisons avec le nom du livreur et pouvez assigner les commandes aux livreurs.',
        },
      ] as const;

      return (
        <View style={styles.settingsList}>
          <View style={styles.settingCard}>
            <Text style={styles.settingTitle}>Mode de livraison</Text>
            <Text style={[styles.settingSubtitle, { marginBottom: 16 }]}>
              Choisissez votre mode de travail
            </Text>
            <View style={styles.modeSelector}>
              {DELIVERY_MODES.map((mode) => {
                const isActive = settings.deliveryMode === mode.id;
                return (
                  <TouchableOpacity
                    key={mode.id}
                    style={[
                      styles.modeOption,
                      {
                        backgroundColor: isActive ? palette.accent : palette.surface,
                        borderColor: isActive ? palette.accent : palette.border,
                      },
                    ]}
                    onPress={() =>
                      setSettings((prev) => ({ ...prev, deliveryMode: mode.id as any }))
                    }
                  >
                    <Text
                      style={[
                        styles.modeOptionLabel,
                        {
                          color: isActive ? '#FFFFFF' : palette.dark,
                        },
                      ]}
                    >
                      {mode.label}
                    </Text>
                    <Text
                      style={[
                        styles.modeOptionDescription,
                        {
                          color: isActive ? '#FFFFFF' : palette.muted,
                        },
                      ]}
                    >
                      {mode.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

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
      const filteredHistoryOrders = historySearch
        ? historyOrders.filter((entry) =>
            `${entry.orderNumber ?? ''}`.toLowerCase().includes(historySearch.toLowerCase())
          )
        : historyOrders;

      return (
        <View style={styles.historyList}>
          <View style={styles.searchRow}>
            <TextInput
              value={historySearch}
              onChangeText={setHistorySearch}
              placeholder="Rechercher # commande"
              placeholderTextColor={palette.muted}
              style={[
                styles.searchInput,
                { borderColor: palette.border, color: palette.dark, backgroundColor: palette.surface },
              ]}
            />
            {historySearch ? (
              <TouchableOpacity style={styles.clearButton} onPress={() => setHistorySearch('')}>
                <Text style={styles.clearButtonText}>Effacer</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {filteredHistoryOrders.length === 0 ? (
            <View style={styles.deliveryEmpty}>
              <Text style={styles.deliveryEmptyTitle}>
                {historySearch ? 'Aucun résultat' : 'Aucune livraison passée'}
              </Text>
              <Text style={styles.deliveryEmptySubtitle}>
                {historySearch
                  ? 'Aucune commande ne correspond à votre recherche.'
                  : 'Vos livraisons terminées apparaîtront ici.'}
              </Text>
            </View>
          ) : (
            <>
              {filteredHistoryOrders.map((entry) => {
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
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <Text style={styles.historyMeta}>{formatDateTime(entry.timestamp)}</Text>
                      {(settings.deliveryMode === 'team' || settings.deliveryMode === 'coordinator') &&
                        entry.driverName && (
                          <Text style={[styles.historyMeta, { fontStyle: 'italic', textAlign: 'right' }]}>
                            Livré par : {entry.driverName}
                          </Text>
                        )}
                    </View>
                    {formatHistoryPayment(entry.paymentMethod) ? (
                      <Text style={styles.historyMeta}>
                        Paiement : {formatHistoryPayment(entry.paymentMethod)}
                      </Text>
                    ) : null}
                    {entry.tipAmount && entry.tipAmount > 0 ? (
                      <Text style={styles.historyMeta}>
                        Pourboire : ${entry.tipAmount.toFixed(2)}
                      </Text>
                    ) : null}
                    {entry.status === 'failed' && entry.failureReason ? (
                      <Text style={styles.historyFailure}>Motif: {entry.failureReason}</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
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
    settings.deliveryMode,
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
                  deliveryMode={settings.deliveryMode}
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

      <AssignDriverModal
        order={assignOrder}
        drivers={availableDrivers}
        loading={loadingDrivers}
        palette={palette}
        styles={styles}
        onCancel={() => setAssignOrder(null)}
        onSelect={(driverId, driverName) => {
          if (!assignOrder) return;
          Alert.alert(
            'Assigner la commande',
            `Voulez-vous assigner la commande #${assignOrder.orderNumber ?? '—'} à ${driverName} ?`,
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Confirmer',
                style: 'default',
                onPress: () => assignOrderToDriver(assignOrder.id, driverId),
              },
            ]
          );
        }}
      />
    </SafeAreaView>
  );
}

function AvailableOrdersList({
  orders,
  loading,
  deliveryMode,
  onAccept,
  onAssign,
  onPreview,
  styles,
}: {
  orders: AvailableOrder[];
  loading: boolean;
  deliveryMode: 'team' | 'individual' | 'coordinator';
  onAccept: (order: AvailableOrder) => void;
  onAssign?: (order: AvailableOrder) => void;
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
          {order.scheduledAt ? (
            <Text style={[styles.availableMeta, { marginTop: 4 }]}>
              Prévue : {formatDateTime(order.scheduledAt)}
            </Text>
          ) : null}
          {order.paymentMethod ? (
            <Text style={[styles.availableMeta, { marginTop: 4 }]}>
              Paiement : {translatePaymentMethod(order.paymentMethod)}
            </Text>
          ) : null}
          {order.tipAmount && order.tipAmount > 0 ? (
            <Text style={[styles.availableMeta, { marginTop: 4 }]}>
              Pourboire : ${order.tipAmount.toFixed(2)}
            </Text>
          ) : null}
          <View style={styles.availableMetaRow}>
            <Text style={styles.availableMeta}>{order.distance}</Text>
            <Text style={styles.availableMeta}>{order.eta}</Text>
          </View>
          <TouchableOpacity style={styles.availableSecondaryButton} onPress={() => onPreview(order)}>
            <Text style={styles.availableSecondaryButtonText}>Voir les informations</Text>
          </TouchableOpacity>
          {deliveryMode === 'coordinator' && onAssign ? (
            <TouchableOpacity
              style={[styles.availablePrimaryButton, { backgroundColor: basePalette.accent }]}
              onPress={() => onAssign(order)}
            >
              <Text style={styles.availablePrimaryButtonText}>Assigner à un livreur</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.availablePrimaryButton} onPress={() => onAccept(order)}>
              <Text style={styles.availablePrimaryButtonText}>Accepter la commande</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

type DeliveryCardProps = {
  order: AssignedOrder;
  deliveryMode: 'team' | 'individual' | 'coordinator';
  onNavigate?: () => void;
  onChangeStatus: (status: AssignedOrder['status']) => void;
  onClose?: () => void;
  forceStatusLabel?: string;
  onViewInfo?: () => void;
  onReportFailure?: (order: AssignedOrder) => void;
  onAssign?: () => void;
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
  deliveryMode,
  onNavigate,
  onChangeStatus,
  onClose,
  forceStatusLabel,
  onViewInfo,
  onReportFailure,
  onAssign,
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

  // En mode Équipe ou Coordinateur, afficher le nom du livreur au lieu de la ville
  const headerRightLabel =
    (deliveryMode === 'team' || deliveryMode === 'coordinator') && order.driverName
      ? `Prise en charge par : ${order.driverName}`
      : cityLabel || forceStatusLabel || currentStatus.label;

  return (
    <View style={styles.availableCard}>
      <View style={styles.availableCardHeader}>
        <Text style={styles.availableOrderNumber}>Commande #{order.orderNumber ?? '—'}</Text>
        <Text style={styles.availableCity}>{headerRightLabel}</Text>
      </View>
      <Text style={styles.availableAddress}>{order.customerAddress}</Text>
      {order.scheduledAt ? (
        <Text style={[styles.availableMeta, { marginTop: 4 }]}>
          Prévue : {formatDateTime(order.scheduledAt)}
        </Text>
      ) : null}
      <View style={styles.availableMetaRow}>
        <View style={{ flex: 1 }}>
          {formatHistoryPayment(order.paymentMethod) ? (
            <Text style={styles.availableMeta}>
              Paiement : {formatHistoryPayment(order.paymentMethod)}
            </Text>
          ) : (
            <Text style={styles.availableMeta}>
              Paiement : {order.paymentInfo === 'paid_online' ? 'Payé en ligne' : 'Payable à la porte'}
            </Text>
          )}
          {order.tipAmount && order.tipAmount > 0 ? (
            <Text style={styles.availableMeta}>
              Pourboire : ${order.tipAmount.toFixed(2)}
            </Text>
          ) : null}
        </View>
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
            {deliveryMode === 'coordinator' && (order.status === 'ready' || !order.driverId) && onAssign && (
              <TouchableOpacity
                style={[styles.availablePrimaryButton, { backgroundColor: palette.accent }]}
                onPress={onAssign}
              >
                <Text style={styles.availablePrimaryButtonText}>Assigner à un livreur</Text>
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
            <Text style={[styles.previewSectionTitle, { color: palette.dark, marginBottom: 12 }]}>Client</Text>
            <Text style={[styles.previewSectionValue, { color: palette.dark, marginBottom: 8 }]}>{clientName}</Text>
            <View style={{ marginBottom: 8 }}>
              <Text style={[styles.previewSectionMeta, { color: palette.muted }]}>
                Tél. {clientPhone}
              </Text>
              <Text style={[styles.previewSectionMeta, { color: palette.muted }]}>{clientEmail}</Text>
            </View>
            {(order.apartmentSuite || order.dropOption || order.notes) && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.border }}>
                {order.apartmentSuite ? (
                  <Text style={[styles.previewSectionMeta, { color: palette.muted, marginBottom: 6 }]}>
                    Appartement/Suite : {order.apartmentSuite}
                  </Text>
                ) : null}
                {order.dropOption ? (
                  <Text style={[styles.previewSectionMeta, { color: palette.muted, marginBottom: 6, fontWeight: '600' }]}>
                    Instructions de dépôt : {translateDropOption(order.dropOption)}
                  </Text>
                ) : null}
                {order.notes ? (
                  <Text style={[styles.previewSectionMeta, { color: palette.muted }]}>
                    Note : {order.notes}
                  </Text>
                ) : null}
              </View>
            )}
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
        <TouchableOpacity
          style={[styles.availableSecondaryButton, { marginTop: 24 }]}
          onPress={onClose}
        >
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButtonText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 14,
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
  modeSelector: {
    gap: 12,
  },
  modeOption: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  modeOptionLabel: {
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 6,
  },
  modeOptionDescription: {
    fontSize: 13,
    lineHeight: 18,
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
            <Text style={styles.failureTitle}>Impossible d'effectuer la livraison</Text>
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

type AssignDriverModalProps = {
  order: AssignedOrder | null;
  drivers: Array<{ id: string; username: string }>;
  loading: boolean;
  palette: Palette;
  styles: DeliveryStyles;
  onCancel: () => void;
  onSelect: (driverId: string, driverName: string) => void;
};

function AssignDriverModal({
  order,
  drivers,
  loading,
  palette,
  styles,
  onCancel,
  onSelect,
}: AssignDriverModalProps) {
  return (
    <Modal visible={Boolean(order)} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalBackdrop} onPress={onCancel}>
        <Pressable
          style={[styles.failureModalCard, { backgroundColor: palette.surface }]}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={[styles.failureTitle, { color: palette.dark }]}>
            Assigner la commande #{order?.orderNumber ?? '—'}
          </Text>
          <Text style={[styles.settingSubtitle, { color: palette.muted, marginBottom: 16 }]}>
            Sélectionnez un livreur
          </Text>
          {loading ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 20 }}>
              <ActivityIndicator color={palette.accent} />
            </View>
          ) : drivers.length === 0 ? (
            <Text style={[styles.settingSubtitle, { color: palette.muted }]}>
              Aucun livreur disponible
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 300 }}>
              {drivers.map((driver) => (
                <TouchableOpacity
                  key={driver.id}
                  style={[
                    styles.modeOption,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                      marginBottom: 10,
                    },
                  ]}
                  onPress={() => onSelect(driver.id, driver.username)}
                >
                  <Text style={[styles.modeOptionLabel, { color: palette.dark }]}>
                    {driver.username}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <View style={styles.modalActionsRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}


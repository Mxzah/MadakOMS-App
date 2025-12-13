import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../../kitchen/constants';
import type { OrderingSettings, RestaurantInfo } from '../types';
import { useDeliveryZones } from '../hooks/useDeliveryZones';
import { useDeliveryFeeRules, type DeliveryFeeRules, type PeakHour, type MinimumOrderSurcharge } from '../hooks/useDeliveryFeeRules';
import { usePaymentSettings, type PaymentMethod } from '../hooks/usePaymentSettings';
import { useRestaurantHours, type RestaurantHours, type DayHours } from '../hooks/useRestaurantHours';
import { useDistanceSettings, type DistanceSettings } from '../hooks/useDistanceSettings';
import { styles } from '../styles';
import type { KitchenTheme } from '../../kitchen/types';

type SettingsTabProps = {
  restaurantInfo: RestaurantInfo;
  orderingSettings: OrderingSettings;
  loading: boolean;
  saving: boolean;
  restaurantId: string;
  onUpdateRestaurantInfo: (info: RestaurantInfo) => Promise<boolean>;
  onUpdateOrderingSettings: (settings: OrderingSettings) => Promise<boolean>;
  darkModeEnabled?: boolean;
  onToggleDarkMode?: (enabled: boolean) => void;
  onLogout?: () => void;
  theme?: KitchenTheme;
  isDark?: boolean;
};

// Fonction de validation de l'email
const validateEmail = (email: string | null): { isValid: boolean; error?: string } => {
  if (!email || email.trim() === '') {
    return { isValid: true }; // Vide est valide (optionnel)
  }

  // Expression régulière pour valider l'email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email.trim())) {
    return {
      isValid: false,
      error: 'Format d\'email invalide (ex: restaurant@example.com)',
    };
  }

  return { isValid: true };
};

// Fonction de validation du numéro de téléphone
const validatePhoneNumber = (phone: string | null): { isValid: boolean; error?: string } => {
  if (!phone || phone.trim() === '') {
    return { isValid: true }; // Vide est valide (optionnel)
  }

  // Retirer tous les caractères non numériques sauf + (pour les numéros internationaux)
  const digitsOnly = phone.replace(/[^\d+]/g, '');
  
  // Si commence par +, c'est un numéro international
  if (digitsOnly.startsWith('+')) {
    // Au moins 10 chiffres après le +
    const digitsAfterPlus = digitsOnly.slice(1);
    if (digitsAfterPlus.length < 10 || digitsAfterPlus.length > 15) {
      return {
        isValid: false,
        error: 'Le numéro international doit contenir entre 10 et 15 chiffres',
      };
    }
    return { isValid: true };
  }

  // Format nord-américain : 10 chiffres
  if (digitsOnly.length === 10) {
    return { isValid: true };
  }

  // Format avec indicatif : 11 chiffres (1 + 10)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return { isValid: true };
  }

  return {
    isValid: false,
    error: 'Le numéro doit contenir 10 chiffres (ex: 514-123-4567)',
  };
};

// Fonction de validation du rayon de livraison
const validateDeliveryRadius = (radius: string | null): string | undefined => {
  if (!radius || radius.trim() === '') {
    return undefined; // Vide est valide (optionnel)
  }

  const num = parseFloat(radius);
  if (isNaN(num) || num <= 0) {
    return 'Le rayon doit être un nombre positif';
  }

  return undefined;
};

// Fonction de validation du GeoJSON
const validateGeoJSON = (geojson: any): string | undefined => {
  if (!geojson) {
    return undefined; // Vide est valide (optionnel)
  }

  if (typeof geojson !== 'object') {
    return 'Le GeoJSON doit être un objet valide';
  }

  // Types GeoJSON valides selon la spécification
  const validTypes = [
    // Types de géométrie
    'Point',
    'LineString',
    'Polygon',
    'MultiPoint',
    'MultiLineString',
    'MultiPolygon',
    // Types de collection
    'Feature',
    'FeatureCollection',
    'GeometryCollection',
  ];

  if (!geojson.type || !validTypes.includes(geojson.type)) {
    return `Le type GeoJSON doit être l'un des suivants: ${validTypes.join(', ')}`;
  }

  // Validation basique pour les géométries
  if (['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(geojson.type)) {
    if (!geojson.coordinates || !Array.isArray(geojson.coordinates)) {
      return 'Les géométries GeoJSON doivent avoir une propriété "coordinates" de type tableau';
    }
  }

  return undefined;
};

export function SettingsTab({
  restaurantInfo,
  orderingSettings,
  loading,
  saving,
  restaurantId,
  onUpdateRestaurantInfo,
  onUpdateOrderingSettings,
  darkModeEnabled = false,
  onToggleDarkMode,
  onLogout,
  theme,
  isDark = false,
}: SettingsTabProps) {
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

  // Styles dynamiques basés sur le thème
  const dynamicStyles = {
    sectionCard: { ...styles.sectionCard, backgroundColor: currentTheme.surface },
    sectionTitle: { ...styles.sectionTitle, color: currentTheme.textPrimary },
    modalSection: { ...styles.modalSection, backgroundColor: currentTheme.surfaceMuted },
    modalSectionTitle: { ...styles.modalSectionTitle, color: currentTheme.textPrimary },
    searchInput: {
      ...styles.searchInput,
      backgroundColor: currentTheme.surface,
      borderColor: currentTheme.border,
      color: currentTheme.textPrimary,
    },
  };
  const [localRestaurantInfo, setLocalRestaurantInfo] = useState<RestaurantInfo>(restaurantInfo);
  const [localOrderingSettings, setLocalOrderingSettings] = useState<OrderingSettings>(orderingSettings);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);
  const [emailError, setEmailError] = useState<string | undefined>(undefined);

  const {
    deliveryZones,
    loading: deliveryZonesLoading,
    saving: savingDeliveryZones,
    setDeliveryZones,
    saveDeliveryZones,
  } = useDeliveryZones(restaurantId);

  const {
    deliveryFeeRules,
    loading: deliveryFeeRulesLoading,
    saving: savingDeliveryFeeRules,
    saveDeliveryFeeRules,
  } = useDeliveryFeeRules(restaurantId);

  const {
    paymentSettings,
    loading: paymentSettingsLoading,
    saving: savingPaymentSettings,
    setPaymentSettings,
    savePaymentSettings,
  } = usePaymentSettings(restaurantId);

  const {
    restaurantHours,
    loading: restaurantHoursLoading,
    saving: savingRestaurantHours,
    setRestaurantHours,
    saveRestaurantHours,
  } = useRestaurantHours(restaurantId);

  const {
    distanceSettings,
    loading: distanceSettingsLoading,
    saving: savingDistanceSettings,
    saveDistanceSettings,
  } = useDistanceSettings(restaurantId);

  const [localPaymentSettings, setLocalPaymentSettings] = useState<typeof paymentSettings>(paymentSettings);
  const [localRestaurantHours, setLocalRestaurantHours] = useState<RestaurantHours>(restaurantHours);
  const [localDistanceSettings, setLocalDistanceSettings] = useState<DistanceSettings>(distanceSettings);

  const [localDeliveryZoneSettings, setLocalDeliveryZoneSettings] = useState({
    deliveryZonesGeoJson: deliveryZones.deliveryZonesGeoJson,
  });
  const [deliveryZonesGeojsonError, setDeliveryZonesGeojsonError] = useState<string | undefined>(undefined);

  const [localDeliveryFeeRules, setLocalDeliveryFeeRules] = useState<DeliveryFeeRules | null>(null);
  
  // États locaux pour les valeurs textuelles des champs numériques (pour permettre la saisie de '.' sans suppression)
  const [baseFeeText, setBaseFeeText] = useState('');
  const [perKmFeeText, setPerKmFeeText] = useState('');
  const [maxDistanceKmText, setMaxDistanceKmText] = useState('');
  const [freeDeliveryAboveText, setFreeDeliveryAboveText] = useState('');
  const [weekendFeeText, setWeekendFeeText] = useState('');
  const [holidayFeeText, setHolidayFeeText] = useState('');
  const [minOrderThresholdText, setMinOrderThresholdText] = useState('');
  const [minOrderSurchargeText, setMinOrderSurchargeText] = useState('');
  const [peakHourFeeTexts, setPeakHourFeeTexts] = useState<{ [key: number]: string }>({});

  // Update local state when props change
  useEffect(() => {
    setLocalRestaurantInfo(restaurantInfo);
  }, [restaurantInfo]);

  useEffect(() => {
    setLocalOrderingSettings(orderingSettings);
  }, [orderingSettings]);

  useEffect(() => {
    setLocalDeliveryZoneSettings({
      deliveryZonesGeoJson: deliveryZones.deliveryZonesGeoJson,
    });
  }, [deliveryZones]);

  useEffect(() => {
    setLocalPaymentSettings(paymentSettings);
  }, [paymentSettings]);

  useEffect(() => {
    setLocalRestaurantHours(restaurantHours);
  }, [restaurantHours]);

  useEffect(() => {
    setLocalDistanceSettings(distanceSettings);
  }, [distanceSettings]);

  useEffect(() => {
    if (deliveryFeeRules) {
      setLocalDeliveryFeeRules(deliveryFeeRules);
      // Initialiser les textes avec les valeurs existantes
      setBaseFeeText(deliveryFeeRules.baseFee !== undefined && deliveryFeeRules.baseFee !== null ? deliveryFeeRules.baseFee.toString() : '');
      setPerKmFeeText(deliveryFeeRules.perKmFee !== undefined && deliveryFeeRules.perKmFee !== null ? deliveryFeeRules.perKmFee.toString() : '');
      setMaxDistanceKmText(deliveryFeeRules.maxDistanceKm !== undefined && deliveryFeeRules.maxDistanceKm !== null ? deliveryFeeRules.maxDistanceKm.toString() : '');
      setFreeDeliveryAboveText(deliveryFeeRules.freeDeliveryAbove !== undefined && deliveryFeeRules.freeDeliveryAbove !== null ? deliveryFeeRules.freeDeliveryAbove.toString() : '');
      setWeekendFeeText(deliveryFeeRules.weekendFee !== undefined && deliveryFeeRules.weekendFee !== null ? deliveryFeeRules.weekendFee.toString() : '');
      setHolidayFeeText(deliveryFeeRules.holidayFee !== undefined && deliveryFeeRules.holidayFee !== null ? deliveryFeeRules.holidayFee.toString() : '');
      setMinOrderThresholdText(deliveryFeeRules.minimumOrderSurcharge?.threshold !== undefined && deliveryFeeRules.minimumOrderSurcharge?.threshold !== null ? deliveryFeeRules.minimumOrderSurcharge.threshold.toString() : '');
      setMinOrderSurchargeText(deliveryFeeRules.minimumOrderSurcharge?.surcharge !== undefined && deliveryFeeRules.minimumOrderSurcharge?.surcharge !== null ? deliveryFeeRules.minimumOrderSurcharge.surcharge.toString() : '');
      
      // Initialiser les textes pour les heures de pointe
      if (deliveryFeeRules.peakHours) {
        const texts: { [key: number]: string } = {};
        deliveryFeeRules.peakHours.forEach((ph, idx) => {
          texts[idx] = ph.additionalFee.toString();
        });
        setPeakHourFeeTexts(texts);
      }
    }
  }, [deliveryFeeRules]);

  const handleSaveRestaurantInfo = () => {
    // Valider le numéro de téléphone avant de sauvegarder
    const phoneValidation = validatePhoneNumber(localRestaurantInfo.phone);
    if (!phoneValidation.isValid) {
      Alert.alert('Numéro de téléphone invalide', phoneValidation.error || 'Veuillez entrer un numéro de téléphone valide.');
      return;
    }

    // Valider l'email avant de sauvegarder
    const emailValidation = validateEmail(localRestaurantInfo.email);
    if (!emailValidation.isValid) {
      Alert.alert('Email invalide', emailValidation.error || 'Veuillez entrer un email valide.');
      return;
    }

    Alert.alert(
      'Confirmer la sauvegarde',
      'Voulez-vous sauvegarder les modifications des informations du restaurant ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Sauvegarder',
          style: 'default',
          onPress: async () => {
            setSavingInfo(true);
            const success = await onUpdateRestaurantInfo(localRestaurantInfo);
            setSavingInfo(false);
            if (!success) {
              // Reset to original values on error
              setLocalRestaurantInfo(restaurantInfo);
            } else {
              // Clear errors on success
              setPhoneError(undefined);
              setEmailError(undefined);
            }
          },
        },
      ],
    );
  };

  const handleSaveOrderingSettings = () => {
    Alert.alert(
      'Confirmer la sauvegarde',
      'Voulez-vous sauvegarder les modifications des paramètres de commande ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Sauvegarder',
          style: 'default',
          onPress: async () => {
            setSavingSettings(true);
            const success = await onUpdateOrderingSettings(localOrderingSettings);
            setSavingSettings(false);
            if (!success) {
              // Reset to original values on error
              setLocalOrderingSettings(orderingSettings);
            }
          },
        },
      ],
    );
  };

  const handleCancelRestaurantInfo = () => {
    setLocalRestaurantInfo(restaurantInfo);
    setPhoneError(undefined);
    setEmailError(undefined);
  };

  const handleCancelOrderingSettings = () => {
    setLocalOrderingSettings(orderingSettings);
  };

  const handleCancelDeliveryZones = () => {
    setLocalDeliveryZoneSettings({
      deliveryZonesGeoJson: deliveryZones.deliveryZonesGeoJson,
    });
    setDeliveryZonesGeojsonError(undefined);
  };

  const handleSaveDeliveryZones = () => {
    // Valider le GeoJSON
    const geojsonValidation = validateGeoJSON(localDeliveryZoneSettings.deliveryZonesGeoJson);
    if (geojsonValidation) {
      Alert.alert('GeoJSON invalide', geojsonValidation);
      return;
    }

    Alert.alert(
      'Confirmer la sauvegarde',
      'Voulez-vous sauvegarder les modifications des zones de livraison ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Sauvegarder',
          style: 'default',
          onPress: async () => {
            const success = await saveDeliveryZones({
              deliveryRadiusKm: deliveryZones.deliveryRadiusKm, // Garder la valeur existante
              deliveryZonesGeoJson: localDeliveryZoneSettings.deliveryZonesGeoJson,
            });
            if (!success) {
              // Reset to original values on error
              setLocalDeliveryZoneSettings({
                deliveryZonesGeoJson: deliveryZones.deliveryZonesGeoJson,
              });
            } else {
              // Clear errors on success
              setDeliveryZonesGeojsonError(undefined);
            }
          },
        },
      ],
    );
  };

  const handleCancelDeliveryFeeRules = () => {
    if (deliveryFeeRules) {
      setLocalDeliveryFeeRules(deliveryFeeRules);
    }
  };

  const handleSaveDeliveryFeeRules = () => {
    if (!localDeliveryFeeRules) return;

    Alert.alert(
      'Confirmer la sauvegarde',
      'Voulez-vous sauvegarder les modifications des règles de frais de livraison ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Sauvegarder',
          style: 'default',
          onPress: async () => {
            const success = await saveDeliveryFeeRules(localDeliveryFeeRules);
            if (!success && deliveryFeeRules) {
              setLocalDeliveryFeeRules(deliveryFeeRules);
            }
          },
        },
      ],
    );
  };

  const addPeakHour = () => {
    if (!localDeliveryFeeRules) return;
    const newPeakHours = localDeliveryFeeRules.peakHours || [];
    setLocalDeliveryFeeRules({
      ...localDeliveryFeeRules,
      peakHours: [...newPeakHours, { start: '11:00', end: '13:00', additionalFee: 0 }],
    });
  };

  const removePeakHour = (index: number) => {
    if (!localDeliveryFeeRules || !localDeliveryFeeRules.peakHours) return;
    const newPeakHours = localDeliveryFeeRules.peakHours.filter((_, i) => i !== index);
    setLocalDeliveryFeeRules({
      ...localDeliveryFeeRules,
      peakHours: newPeakHours.length > 0 ? newPeakHours : null,
    });
  };

  const updatePeakHour = (index: number, field: keyof PeakHour, value: string | number) => {
    if (!localDeliveryFeeRules || !localDeliveryFeeRules.peakHours) return;
    const newPeakHours = [...localDeliveryFeeRules.peakHours];
    newPeakHours[index] = { ...newPeakHours[index], [field]: value };
    setLocalDeliveryFeeRules({
      ...localDeliveryFeeRules,
      peakHours: newPeakHours,
    });
  };

  const handleCancelPaymentSettings = () => {
    setLocalPaymentSettings(paymentSettings);
  };

  const handleSavePaymentSettings = () => {
    Alert.alert(
      'Confirmer la sauvegarde',
      'Voulez-vous sauvegarder les modifications des paramètres de paiement ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Sauvegarder',
          style: 'default',
          onPress: async () => {
            const success = await savePaymentSettings(localPaymentSettings);
            if (!success) {
              setLocalPaymentSettings(paymentSettings);
            }
          },
        },
      ],
    );
  };

  const handleCancelRestaurantHours = () => {
    setLocalRestaurantHours(restaurantHours);
  };

  const handleSaveRestaurantHours = () => {
    Alert.alert(
      'Confirmer la sauvegarde',
      'Voulez-vous sauvegarder les modifications des horaires ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Sauvegarder',
          style: 'default',
          onPress: async () => {
            const success = await saveRestaurantHours(localRestaurantHours);
            if (!success) {
              setLocalRestaurantHours(restaurantHours);
            }
          },
        },
      ],
    );
  };

  const togglePaymentMethod = (service: 'pickup' | 'delivery', method: PaymentMethod) => {
    const currentMethods = localPaymentSettings[service];
    const newMethods = currentMethods.includes(method)
      ? currentMethods.filter((m) => m !== method)
      : [...currentMethods, method];
    
    setLocalPaymentSettings({
      ...localPaymentSettings,
      [service]: newMethods,
    });
  };

  const toggleDayEnabled = (day: keyof RestaurantHours) => {
    const dayHours = localRestaurantHours[day];
    setLocalRestaurantHours({
      ...localRestaurantHours,
      [day]: {
        ...dayHours,
        enabled: !dayHours.enabled,
        open: !dayHours.enabled ? (dayHours.open || '09:00') : dayHours.open,
        close: !dayHours.enabled ? (dayHours.close || '17:00') : dayHours.close,
      },
    });
  };

  const updateDayHours = (day: keyof RestaurantHours, field: 'open' | 'close', value: string) => {
    setLocalRestaurantHours({
      ...localRestaurantHours,
      [day]: {
        ...localRestaurantHours[day],
        [field]: value || null,
      },
    });
  };

  const handleCancelDistanceSettings = () => {
    setLocalDistanceSettings(distanceSettings);
  };

  const handleSaveDistanceSettings = () => {
    Alert.alert(
      'Confirmer la sauvegarde',
      'Voulez-vous sauvegarder les paramètres de calcul de distance ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Sauvegarder',
          style: 'default',
          onPress: async () => {
            const success = await saveDistanceSettings(localDistanceSettings);
            if (!success) {
              setLocalDistanceSettings(distanceSettings);
            }
          },
        },
      ],
    );
  };

  if (loading || deliveryZonesLoading || deliveryFeeRulesLoading || paymentSettingsLoading || restaurantHoursLoading || distanceSettingsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={currentTheme.pillActiveBg} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: currentTheme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        style={[styles.scroll, { backgroundColor: currentTheme.background }]}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
      {/* Restaurant Info Section */}
      <View style={[styles.sectionCard, { backgroundColor: currentTheme.surface }]}>
        <Text style={[styles.sectionTitle, { color: currentTheme.textPrimary }]}>⚙️ Restaurant Info</Text>

        <View style={[styles.modalSection, { backgroundColor: currentTheme.surfaceMuted }]}>
          <Text style={[styles.modalSectionTitle, { color: currentTheme.textPrimary }]}>Nom</Text>
          <TextInput
            value={localRestaurantInfo.name}
            onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, name: text })}
            placeholder="Nom du restaurant"
            placeholderTextColor={currentTheme.textSecondary}
            style={[
              styles.searchInput,
              {
                backgroundColor: currentTheme.surface,
                borderColor: currentTheme.border,
                color: currentTheme.textPrimary,
              },
            ]}
          />
        </View>

        <View style={[styles.modalSection, { backgroundColor: currentTheme.surfaceMuted }]}>
          <Text style={[styles.modalSectionTitle, { color: currentTheme.textPrimary }]}>Téléphone</Text>
          <TextInput
            value={localRestaurantInfo.phone || ''}
            onChangeText={(text) => {
              const phone = text || null;
              setLocalRestaurantInfo({ ...localRestaurantInfo, phone });
              // Valider en temps réel
              const validation = validatePhoneNumber(phone);
              setPhoneError(validation.isValid ? undefined : validation.error);
            }}
            placeholder="514-123-4567"
            placeholderTextColor={currentTheme.textSecondary}
            style={[
              styles.searchInput,
              {
                backgroundColor: currentTheme.surface,
                borderColor: phoneError ? '#EF4444' : currentTheme.border,
                color: currentTheme.textPrimary,
              },
              phoneError && { borderWidth: 1 },
            ]}
            keyboardType="default"
          />
          {phoneError && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
              {phoneError}
            </Text>
          )}
          {!phoneError && localRestaurantInfo.phone && (
            <Text style={{ color: currentTheme.textSecondary, fontSize: 12, marginTop: 4 }}>
              Format valide
            </Text>
          )}
        </View>

        <View style={[styles.modalSection, { backgroundColor: currentTheme.surfaceMuted }]}>
          <Text style={[styles.modalSectionTitle, { color: currentTheme.textPrimary }]}>Email</Text>
          <TextInput
            value={localRestaurantInfo.email || ''}
            onChangeText={(text) => {
              const email = text || null;
              setLocalRestaurantInfo({ ...localRestaurantInfo, email });
              // Valider en temps réel
              const validation = validateEmail(email);
              setEmailError(validation.isValid ? undefined : validation.error);
            }}
            placeholder="restaurant@example.com"
            placeholderTextColor={currentTheme.textSecondary}
            style={[
              styles.searchInput,
              {
                backgroundColor: currentTheme.surface,
                borderColor: emailError ? '#EF4444' : currentTheme.border,
                color: currentTheme.textPrimary,
              },
              emailError && { borderWidth: 1 },
            ]}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {emailError && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
              {emailError}
            </Text>
          )}
          {!emailError && localRestaurantInfo.email && (
            <Text style={{ color: currentTheme.textSecondary, fontSize: 12, marginTop: 4 }}>
              Format valide
            </Text>
          )}
        </View>

        <View style={dynamicStyles.modalSection}>
          <Text style={dynamicStyles.modalSectionTitle}>Adresse</Text>
          <TextInput
            value={localRestaurantInfo.addressLine1 || ''}
            onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, addressLine1: text || null })}
            placeholder="Ligne 1"
            placeholderTextColor={currentTheme.textSecondary}
            style={[dynamicStyles.searchInput, { marginBottom: 8 }]}
          />
          <TextInput
            value={localRestaurantInfo.addressLine2 || ''}
            onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, addressLine2: text || null })}
            placeholder="Ligne 2 (optionnel)"
            placeholderTextColor={currentTheme.textSecondary}
            style={[dynamicStyles.searchInput, { marginBottom: 8 }]}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={localRestaurantInfo.city || ''}
              onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, city: text || null })}
              placeholder="Ville"
              placeholderTextColor={currentTheme.textSecondary}
              style={[dynamicStyles.searchInput, { flex: 1 }]}
            />
            <TextInput
              value={localRestaurantInfo.province || ''}
              onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, province: text || null })}
              placeholder="Province"
              placeholderTextColor={currentTheme.textSecondary}
              style={[dynamicStyles.searchInput, { flex: 1 }]}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput
              value={localRestaurantInfo.postalCode || ''}
              onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, postalCode: text || null })}
              placeholder="Code postal"
              placeholderTextColor={currentTheme.textSecondary}
              style={[dynamicStyles.searchInput, { flex: 1 }]}
            />
            <TextInput
              value={localRestaurantInfo.country || ''}
              onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, country: text || null })}
              placeholder="Pays"
              placeholderTextColor={currentTheme.textSecondary}
              style={[dynamicStyles.searchInput, { flex: 1 }]}
            />
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <TouchableOpacity
            style={[
              styles.modalCloseButton,
              { backgroundColor: currentTheme.surfaceMuted },
              (saving || savingInfo) && { opacity: 0.6 },
            ]}
            onPress={handleCancelRestaurantInfo}
            disabled={saving || savingInfo}
          >
            <Text style={[styles.modalCloseText, { color: currentTheme.textPrimary }]}>
              Annuler les changements
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalCloseButton, (saving || savingInfo) && { opacity: 0.6 }]}
            onPress={handleSaveRestaurantInfo}
            disabled={saving || savingInfo}
          >
            <Text style={styles.modalCloseText}>
              {savingInfo ? 'Sauvegarde…' : 'Sauvegarder les informations'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Ordering Settings Section */}
      <View style={dynamicStyles.sectionCard}>
        <Text style={dynamicStyles.sectionTitle}>📦 Paramètres de commande</Text>

        <View style={dynamicStyles.modalSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={dynamicStyles.modalSectionTitle}>Commandes activées</Text>
            <Switch
              value={localOrderingSettings.orderingEnabled}
              onValueChange={(value) => setLocalOrderingSettings({ ...localOrderingSettings, orderingEnabled: value })}
              trackColor={{ false: '#E5E7EB', true: colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={dynamicStyles.modalSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={dynamicStyles.modalSectionTitle}>À emporter activé</Text>
            <Switch
              value={localOrderingSettings.pickupEnabled}
              onValueChange={(value) => setLocalOrderingSettings({ ...localOrderingSettings, pickupEnabled: value })}
              trackColor={{ false: '#E5E7EB', true: colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={dynamicStyles.modalSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={dynamicStyles.modalSectionTitle}>Livraison activée</Text>
            <Switch
              value={localOrderingSettings.deliveryEnabled}
              onValueChange={(value) => setLocalOrderingSettings({ ...localOrderingSettings, deliveryEnabled: value })}
              trackColor={{ false: '#E5E7EB', true: colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={dynamicStyles.modalSection}>
          <Text style={dynamicStyles.modalSectionTitle}>Montant minimum - À emporter</Text>
          <TextInput
            value={localOrderingSettings.minOrderAmountPickup?.toString() || ''}
            onChangeText={(text) => {
              const num = text ? parseFloat(text) : null;
              setLocalOrderingSettings({ ...localOrderingSettings, minOrderAmountPickup: num });
            }}
            placeholder="0.00"
            placeholderTextColor={currentTheme.textSecondary}
            style={dynamicStyles.searchInput}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={dynamicStyles.modalSection}>
          <Text style={dynamicStyles.modalSectionTitle}>Montant minimum - Livraison</Text>
          <TextInput
            value={localOrderingSettings.minOrderAmountDelivery?.toString() || ''}
            onChangeText={(text) => {
              const num = text ? parseFloat(text) : null;
              setLocalOrderingSettings({ ...localOrderingSettings, minOrderAmountDelivery: num });
            }}
            placeholder="0.00"
            placeholderTextColor={currentTheme.textSecondary}
            style={dynamicStyles.searchInput}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={dynamicStyles.modalSection}>
          <Text style={dynamicStyles.modalSectionTitle}>Temps de préparation estimé (minutes)</Text>
          <TextInput
            value={localOrderingSettings.estimatedPrepTimeMinutes?.toString() || ''}
            onChangeText={(text) => {
              const num = text ? parseInt(text, 10) : null;
              setLocalOrderingSettings({ ...localOrderingSettings, estimatedPrepTimeMinutes: num });
            }}
            placeholder="20"
            placeholderTextColor={currentTheme.textSecondary}
            style={dynamicStyles.searchInput}
            keyboardType="numeric"
          />
        </View>

        <View style={dynamicStyles.modalSection}>
          <Text style={dynamicStyles.modalSectionTitle}>Temps de livraison estimé (minutes)</Text>
          <TextInput
            value={localOrderingSettings.estimatedDeliveryTimeMinutes?.toString() || ''}
            onChangeText={(text) => {
              const num = text ? parseInt(text, 10) : null;
              setLocalOrderingSettings({ ...localOrderingSettings, estimatedDeliveryTimeMinutes: num });
            }}
            placeholder="30"
            placeholderTextColor={currentTheme.textSecondary}
            style={dynamicStyles.searchInput}
            keyboardType="numeric"
          />
        </View>

        <View style={{ gap: 12 }}>
          <TouchableOpacity
            style={[
              styles.modalCloseButton,
              { backgroundColor: currentTheme.surfaceMuted },
              (saving || savingSettings) && { opacity: 0.6 },
            ]}
            onPress={handleCancelOrderingSettings}
            disabled={saving || savingSettings}
          >
            <Text style={[styles.modalCloseText, { color: currentTheme.textPrimary }]}>
              Annuler les changements
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalCloseButton, (saving || savingSettings) && { opacity: 0.6 }]}
            onPress={handleSaveOrderingSettings}
            disabled={saving || savingSettings}
          >
            <Text style={styles.modalCloseText}>
              {savingSettings ? 'Sauvegarde…' : 'Sauvegarder les paramètres'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Delivery Zones Section */}
      <View style={dynamicStyles.sectionCard}>
        <Text style={dynamicStyles.sectionTitle}>📍 Zones de livraison</Text>

        <View style={dynamicStyles.modalSection}>
          <Text style={dynamicStyles.modalSectionTitle}>Zones GeoJSON</Text>
          <TextInput
            value={localDeliveryZoneSettings.deliveryZonesGeoJson ? JSON.stringify(localDeliveryZoneSettings.deliveryZonesGeoJson, null, 2) : ''}
            onChangeText={(text) => {
              try {
                const json = text ? JSON.parse(text) : null;
                setLocalDeliveryZoneSettings({ ...localDeliveryZoneSettings, deliveryZonesGeoJson: json });
                setDeliveryZonesGeojsonError(validateGeoJSON(json));
              } catch (e) {
                setLocalDeliveryZoneSettings({ ...localDeliveryZoneSettings, deliveryZonesGeoJson: null });
                setDeliveryZonesGeojsonError('JSON invalide');
              }
            }}
            placeholder="Entrez le GeoJSON ici..."
            placeholderTextColor={currentTheme.textSecondary}
              style={[
              dynamicStyles.searchInput,
              { height: 120, textAlignVertical: 'top' },
              deliveryZonesGeojsonError && { borderColor: '#EF4444', borderWidth: 1 },
            ]}
            multiline
          />
          {deliveryZonesGeojsonError && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
              {deliveryZonesGeojsonError}
            </Text>
          )}
              {!deliveryZonesGeojsonError && localDeliveryZoneSettings.deliveryZonesGeoJson && (
            <Text style={{ color: currentTheme.textSecondary, fontSize: 12, marginTop: 4 }}>
              GeoJSON valide
            </Text>
          )}
        </View>

        <View style={{ gap: 12 }}>
          <TouchableOpacity
            style={[
              styles.modalCloseButton,
              { backgroundColor: currentTheme.surfaceMuted },
              (saving || savingDeliveryZones) && { opacity: 0.6 },
            ]}
            onPress={handleCancelDeliveryZones}
            disabled={saving || savingDeliveryZones}
          >
            <Text style={[styles.modalCloseText, { color: currentTheme.textPrimary }]}>
              Annuler les changements
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modalCloseButton,
              (saving || savingDeliveryZones) && { opacity: 0.6 },
            ]}
            onPress={handleSaveDeliveryZones}
            disabled={saving || savingDeliveryZones || Boolean(deliveryZonesGeojsonError)}
          >
            <Text style={styles.modalCloseText}>
              {savingDeliveryZones ? 'Sauvegarde…' : 'Sauvegarder les zones de livraison'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Delivery Fee Rules Section */}
      {localDeliveryFeeRules && (
        <View style={dynamicStyles.sectionCard}>
          <Text style={dynamicStyles.sectionTitle}>💰 Règles de frais de livraison</Text>

          {/* Type Selection */}
          <View style={dynamicStyles.modalSection}>
            <Text style={dynamicStyles.modalSectionTitle}>Type de frais</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[
                  { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1 },
                  localDeliveryFeeRules.type === 'flat'
                    ? { backgroundColor: colors.accent, borderColor: colors.accent }
                    : { backgroundColor: currentTheme.surfaceMuted, borderColor: currentTheme.border },
                ]}
                onPress={() => setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, type: 'flat' })}
              >
                <Text
                  style={[
                    { textAlign: 'center', fontWeight: '600' },
                    localDeliveryFeeRules.type === 'flat' ? { color: currentTheme.pillActiveText } : { color: currentTheme.textPrimary },
                  ]}
                >
                  Frais fixe
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1 },
                  localDeliveryFeeRules.type === 'distance_based'
                    ? { backgroundColor: colors.accent, borderColor: colors.accent }
                    : { backgroundColor: currentTheme.surfaceMuted, borderColor: currentTheme.border },
                ]}
                onPress={() => setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, type: 'distance_based' })}
              >
                <Text
                  style={[
                    { textAlign: 'center', fontWeight: '600' },
                    localDeliveryFeeRules.type === 'distance_based' ? { color: currentTheme.pillActiveText } : { color: currentTheme.textPrimary },
                  ]}
                >
                  Basé sur distance
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Base Fee */}
          <View style={dynamicStyles.modalSection}>
            <Text style={dynamicStyles.modalSectionTitle}>Frais de base ($)</Text>
            <TextInput
              value={baseFeeText}
              onChangeText={(text) => {
                // Permettre la saisie de '.' et garder le texte tel quel
                const normalized = text.replace(',', '.');
                setBaseFeeText(normalized);
                // Convertir en nombre seulement si c'est un nombre valide
                if (normalized === '' || normalized === '.') {
                  setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, baseFee: 0 });
                } else {
                  const num = parseFloat(normalized);
                  if (!isNaN(num)) {
                    setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, baseFee: num });
                  }
                }
              }}
              onBlur={() => {
                // À la perte de focus, nettoyer si juste un point
                if (baseFeeText === '.') {
                  setBaseFeeText('0');
                  setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, baseFee: 0 });
                } else if (baseFeeText === '') {
                  setBaseFeeText('0');
                  setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, baseFee: 0 });
                }
              }}
              placeholder="3.99"
              placeholderTextColor={currentTheme.textSecondary}
              style={dynamicStyles.searchInput}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Distance-Based Options */}
          {localDeliveryFeeRules.type === 'distance_based' && (
            <>
              <View style={dynamicStyles.modalSection}>
                <Text style={dynamicStyles.modalSectionTitle}>Frais par km ($)</Text>
                <TextInput
                  value={perKmFeeText}
                  onChangeText={(text) => {
                    const normalized = text.replace(',', '.');
                    setPerKmFeeText(normalized);
                    if (normalized === '' || normalized === '.') {
                      setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, perKmFee: null });
                    } else {
                      const num = parseFloat(normalized);
                      if (!isNaN(num)) {
                        setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, perKmFee: num });
                      }
                    }
                  }}
                  onBlur={() => {
                    if (perKmFeeText === '.') {
                      setPerKmFeeText('');
                      setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, perKmFee: null });
                    }
                  }}
                  placeholder="0.50"
                  placeholderTextColor={currentTheme.textSecondary}
                  style={dynamicStyles.searchInput}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={dynamicStyles.modalSection}>
                <Text style={dynamicStyles.modalSectionTitle}>Distance maximale (km)</Text>
                <TextInput
                  value={maxDistanceKmText}
                  onChangeText={(text) => {
                    const normalized = text.replace(',', '.');
                    setMaxDistanceKmText(normalized);
                    if (normalized === '' || normalized === '.') {
                      setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, maxDistanceKm: null });
                    } else {
                      const num = parseFloat(normalized);
                      if (!isNaN(num)) {
                        setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, maxDistanceKm: num });
                      }
                    }
                  }}
                  onBlur={() => {
                    if (maxDistanceKmText === '.') {
                      setMaxDistanceKmText('');
                      setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, maxDistanceKm: null });
                    }
                  }}
                  placeholder="7"
                  placeholderTextColor={currentTheme.textSecondary}
                  style={dynamicStyles.searchInput}
                  keyboardType="numeric"
                />
              </View>
            </>
          )}

          {/* Free Delivery Above */}
          <View style={dynamicStyles.modalSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={dynamicStyles.modalSectionTitle}>Livraison gratuite au-dessus de ($)</Text>
              <Switch
                value={localDeliveryFeeRules.freeDeliveryAbove !== null}
                onValueChange={(enabled) => {
                  setLocalDeliveryFeeRules({
                    ...localDeliveryFeeRules,
                    freeDeliveryAbove: enabled ? 30 : null,
                  });
                }}
                trackColor={{ false: currentTheme.surfaceMuted, true: currentTheme.pillActiveBg }}
                thumbColor={currentTheme.surface}
              />
            </View>
            {localDeliveryFeeRules.freeDeliveryAbove !== null && (
              <TextInput
                value={freeDeliveryAboveText}
                onChangeText={(text) => {
                  const normalized = text.replace(',', '.');
                  setFreeDeliveryAboveText(normalized);
                  if (normalized === '' || normalized === '.') {
                    setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, freeDeliveryAbove: 0 });
                  } else {
                    const num = parseFloat(normalized);
                    if (!isNaN(num)) {
                      setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, freeDeliveryAbove: num });
                    }
                  }
                }}
                onBlur={() => {
                  if (freeDeliveryAboveText === '.') {
                    setFreeDeliveryAboveText('0');
                    setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, freeDeliveryAbove: 0 });
                  } else if (freeDeliveryAboveText === '') {
                    setFreeDeliveryAboveText('0');
                    setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, freeDeliveryAbove: 0 });
                  }
                }}
                placeholder="30"
                placeholderTextColor={currentTheme.textSecondary}
                style={[dynamicStyles.searchInput, { marginTop: 8 }]}
                keyboardType="decimal-pad"
              />
            )}
          </View>

          {/* Peak Hours */}
          <View style={dynamicStyles.modalSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={dynamicStyles.modalSectionTitle}>Frais d'heures de pointe</Text>
              <TouchableOpacity
                onPress={addPeakHour}
                style={{ padding: 8, backgroundColor: currentTheme.pillActiveBg, borderRadius: 6 }}
              >
                <Text style={{ color: currentTheme.pillActiveText, fontSize: 12, fontWeight: '600' }}>+ Ajouter</Text>
              </TouchableOpacity>
            </View>
            {localDeliveryFeeRules.peakHours && localDeliveryFeeRules.peakHours.length > 0 && (
              <View style={{ gap: 12 }}>
                {localDeliveryFeeRules.peakHours.map((peakHour, index) => (
                  <View key={index} style={{ borderWidth: 1, borderColor: currentTheme.border, borderRadius: 8, padding: 12, backgroundColor: currentTheme.surface }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontWeight: '600', color: currentTheme.textPrimary }}>Période {index + 1}</Text>
                      <TouchableOpacity
                        onPress={() => removePeakHour(index)}
                        style={{ padding: 4 }}
                      >
                        <Text style={{ color: '#EF4444', fontSize: 12 }}>Supprimer</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 4 }}>Début (HH:MM)</Text>
                        <TextInput
                          value={peakHour.start}
                          onChangeText={(text) => updatePeakHour(index, 'start', text)}
                          placeholder="11:00"
                          placeholderTextColor={currentTheme.textSecondary}
                          style={dynamicStyles.searchInput}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 4 }}>Fin (HH:MM)</Text>
                        <TextInput
                          value={peakHour.end}
                          onChangeText={(text) => updatePeakHour(index, 'end', text)}
                          placeholder="13:00"
                          placeholderTextColor={currentTheme.textSecondary}
                          style={dynamicStyles.searchInput}
                        />
                      </View>
                    </View>
                    <View>
                      <Text style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 4 }}>Frais supplémentaire ($)</Text>
                      <TextInput
                        value={peakHourFeeTexts[index] || peakHour.additionalFee.toString()}
                        onChangeText={(text) => {
                          const normalized = text.replace(',', '.');
                          setPeakHourFeeTexts({ ...peakHourFeeTexts, [index]: normalized });
                          if (normalized === '' || normalized === '.') {
                            updatePeakHour(index, 'additionalFee', 0);
                          } else {
                            const num = parseFloat(normalized);
                            if (!isNaN(num)) {
                              updatePeakHour(index, 'additionalFee', num);
                            }
                          }
                        }}
                        onBlur={() => {
                          if (peakHourFeeTexts[index] === '.') {
                            setPeakHourFeeTexts({ ...peakHourFeeTexts, [index]: '0' });
                            updatePeakHour(index, 'additionalFee', 0);
                          }
                        }}
                        placeholder="1.00"
                        placeholderTextColor={currentTheme.textSecondary}
                        style={dynamicStyles.searchInput}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Weekend Fee */}
          <View style={dynamicStyles.modalSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={dynamicStyles.modalSectionTitle}>Frais de fin de semaine ($)</Text>
              <Switch
                value={localDeliveryFeeRules.weekendFee !== null}
                onValueChange={(enabled) => {
                  setLocalDeliveryFeeRules({
                    ...localDeliveryFeeRules,
                    weekendFee: enabled ? 5 : null,
                  });
                }}
                trackColor={{ false: currentTheme.surfaceMuted, true: currentTheme.pillActiveBg }}
                thumbColor={currentTheme.surface}
              />
            </View>
            {localDeliveryFeeRules.weekendFee !== null && (
              <TextInput
                value={weekendFeeText}
                onChangeText={(text) => {
                  const normalized = text.replace(',', '.');
                  setWeekendFeeText(normalized);
                  if (normalized === '' || normalized === '.') {
                    setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, weekendFee: 0 });
                  } else {
                    const num = parseFloat(normalized);
                    if (!isNaN(num)) {
                      setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, weekendFee: num });
                    }
                  }
                }}
                onBlur={() => {
                  if (weekendFeeText === '.') {
                    setWeekendFeeText('0');
                    setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, weekendFee: 0 });
                  } else if (weekendFeeText === '') {
                    setWeekendFeeText('0');
                    setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, weekendFee: 0 });
                  }
                }}
                placeholder="5.00"
                placeholderTextColor={currentTheme.textSecondary}
                style={[dynamicStyles.searchInput, { marginTop: 8 }]}
                keyboardType="decimal-pad"
              />
            )}
          </View>

          {/* Holiday Fee */}
          <View style={dynamicStyles.modalSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={dynamicStyles.modalSectionTitle}>Frais de jour férié ($)</Text>
              <Switch
                value={localDeliveryFeeRules.holidayFee !== null}
                onValueChange={(enabled) => {
                  setLocalDeliveryFeeRules({
                    ...localDeliveryFeeRules,
                    holidayFee: enabled ? 5 : null,
                  });
                }}
                trackColor={{ false: currentTheme.surfaceMuted, true: currentTheme.pillActiveBg }}
                thumbColor={currentTheme.surface}
              />
            </View>
            {localDeliveryFeeRules.holidayFee !== null && (
              <TextInput
                value={holidayFeeText}
                onChangeText={(text) => {
                  const normalized = text.replace(',', '.');
                  setHolidayFeeText(normalized);
                  if (normalized === '' || normalized === '.') {
                    setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, holidayFee: 0 });
                  } else {
                    const num = parseFloat(normalized);
                    if (!isNaN(num)) {
                      setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, holidayFee: num });
                    }
                  }
                }}
                onBlur={() => {
                  if (holidayFeeText === '.') {
                    setHolidayFeeText('0');
                    setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, holidayFee: 0 });
                  } else if (holidayFeeText === '') {
                    setHolidayFeeText('0');
                    setLocalDeliveryFeeRules({ ...localDeliveryFeeRules, holidayFee: 0 });
                  }
                }}
                placeholder="5.00"
                placeholderTextColor={currentTheme.textSecondary}
                style={[dynamicStyles.searchInput, { marginTop: 8 }]}
                keyboardType="decimal-pad"
              />
            )}
          </View>

          {/* Minimum Order Surcharge */}
          <View style={dynamicStyles.modalSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={dynamicStyles.modalSectionTitle}>Surcharge commande minimale</Text>
              <Switch
                value={localDeliveryFeeRules.minimumOrderSurcharge !== null}
                onValueChange={(enabled) => {
                  setLocalDeliveryFeeRules({
                    ...localDeliveryFeeRules,
                    minimumOrderSurcharge: enabled ? { threshold: 15, surcharge: 2 } : null,
                  });
                }}
                trackColor={{ false: currentTheme.surfaceMuted, true: currentTheme.pillActiveBg }}
                thumbColor={currentTheme.surface}
              />
            </View>
            {localDeliveryFeeRules.minimumOrderSurcharge !== null && (
              <View style={{ marginTop: 8, gap: 8 }}>
                <View>
                  <Text style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 4 }}>Seuil ($)</Text>
                    <TextInput
                      value={minOrderThresholdText}
                      onChangeText={(text) => {
                        const normalized = text.replace(',', '.');
                        setMinOrderThresholdText(normalized);
                        if (normalized === '' || normalized === '.') {
                          setLocalDeliveryFeeRules({
                            ...localDeliveryFeeRules,
                            minimumOrderSurcharge: {
                              ...localDeliveryFeeRules.minimumOrderSurcharge!,
                              threshold: 0,
                            },
                          });
                        } else {
                          const num = parseFloat(normalized);
                          if (!isNaN(num)) {
                            setLocalDeliveryFeeRules({
                              ...localDeliveryFeeRules,
                              minimumOrderSurcharge: {
                                ...localDeliveryFeeRules.minimumOrderSurcharge!,
                                threshold: num,
                              },
                            });
                          }
                        }
                      }}
                      onBlur={() => {
                        if (minOrderThresholdText === '.') {
                          setMinOrderThresholdText('0');
                          setLocalDeliveryFeeRules({
                            ...localDeliveryFeeRules,
                            minimumOrderSurcharge: {
                              ...localDeliveryFeeRules.minimumOrderSurcharge!,
                              threshold: 0,
                            },
                          });
                        } else if (minOrderThresholdText === '') {
                          setMinOrderThresholdText('0');
                          setLocalDeliveryFeeRules({
                            ...localDeliveryFeeRules,
                            minimumOrderSurcharge: {
                              ...localDeliveryFeeRules.minimumOrderSurcharge!,
                              threshold: 0,
                            },
                          });
                        }
                      }}
                      placeholder="15"
                      placeholderTextColor={currentTheme.textSecondary}
                      style={dynamicStyles.searchInput}
                      keyboardType="decimal-pad"
                    />
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 4 }}>Surcharge ($)</Text>
                    <TextInput
                      value={minOrderSurchargeText}
                      onChangeText={(text) => {
                        const normalized = text.replace(',', '.');
                        setMinOrderSurchargeText(normalized);
                        if (normalized === '' || normalized === '.') {
                          setLocalDeliveryFeeRules({
                            ...localDeliveryFeeRules,
                            minimumOrderSurcharge: {
                              ...localDeliveryFeeRules.minimumOrderSurcharge!,
                              surcharge: 0,
                            },
                          });
                        } else {
                          const num = parseFloat(normalized);
                          if (!isNaN(num)) {
                            setLocalDeliveryFeeRules({
                              ...localDeliveryFeeRules,
                              minimumOrderSurcharge: {
                                ...localDeliveryFeeRules.minimumOrderSurcharge!,
                                surcharge: num,
                              },
                            });
                          }
                        }
                      }}
                      onBlur={() => {
                        if (minOrderSurchargeText === '.') {
                          setMinOrderSurchargeText('0');
                          setLocalDeliveryFeeRules({
                            ...localDeliveryFeeRules,
                            minimumOrderSurcharge: {
                              ...localDeliveryFeeRules.minimumOrderSurcharge!,
                              surcharge: 0,
                            },
                          });
                        } else if (minOrderSurchargeText === '') {
                          setMinOrderSurchargeText('0');
                          setLocalDeliveryFeeRules({
                            ...localDeliveryFeeRules,
                            minimumOrderSurcharge: {
                              ...localDeliveryFeeRules.minimumOrderSurcharge!,
                              surcharge: 0,
                            },
                          });
                        }
                      }}
                      placeholder="2.00"
                      placeholderTextColor={currentTheme.textSecondary}
                      style={dynamicStyles.searchInput}
                      keyboardType="decimal-pad"
                    />
                </View>
              </View>
            )}
          </View>

          <View style={{ gap: 12 }}>
            <TouchableOpacity
              style={[
                styles.modalCloseButton,
                { backgroundColor: currentTheme.surfaceMuted },
                (saving || savingDeliveryFeeRules) && { opacity: 0.6 },
              ]}
              onPress={handleCancelDeliveryFeeRules}
              disabled={saving || savingDeliveryFeeRules}
            >
              <Text style={[styles.modalCloseText, { color: currentTheme.textPrimary }]}>
                Annuler les changements
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalCloseButton, (saving || savingDeliveryFeeRules) && { opacity: 0.6 }]}
              onPress={handleSaveDeliveryFeeRules}
              disabled={saving || savingDeliveryFeeRules}
            >
              <Text style={styles.modalCloseText}>
                {savingDeliveryFeeRules ? 'Sauvegarde…' : 'Sauvegarder les règles de frais'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Payment Settings Section */}
      <View style={dynamicStyles.sectionCard}>
        <Text style={dynamicStyles.sectionTitle}>💳 Paiements</Text>

        {/* Pickup Payment Methods */}
        <View style={dynamicStyles.modalSection}>
          <Text style={dynamicStyles.modalSectionTitle}>À emporter</Text>
          <View style={{ gap: 12 }}>
            {(['cash', 'card_terminal', 'card_online'] as PaymentMethod[]).map((method) => {
              const isSelected = localPaymentSettings.pickup.includes(method);
              const methodLabels: Record<PaymentMethod, string> = {
                cash: 'Espèces',
                card_terminal: 'Terminal',
                card_online: 'En ligne',
              };
              return (
                <TouchableOpacity
                  key={method}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: isSelected ? currentTheme.pillActiveBg : currentTheme.border,
                    backgroundColor: isSelected ? (isDark ? currentTheme.surfaceMuted : currentTheme.surfaceMuted) : currentTheme.surface,
                  }}
                  onPress={() => togglePaymentMethod('pickup', method)}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: isSelected ? currentTheme.pillActiveBg : currentTheme.textSecondary,
                      backgroundColor: isSelected ? colors.accent : 'transparent',
                      marginRight: 12,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    {isSelected && <Text style={{ color: '#FFFFFF', fontSize: 12 }}>✓</Text>}
                  </View>
                  <Text style={{ fontSize: 16, color: currentTheme.textPrimary }}>{methodLabels[method]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Delivery Payment Methods */}
        <View style={dynamicStyles.modalSection}>
          <Text style={dynamicStyles.modalSectionTitle}>Livraison</Text>
          <View style={{ gap: 12 }}>
            {(['cash', 'card_terminal', 'card_online'] as PaymentMethod[]).map((method) => {
              const isSelected = localPaymentSettings.delivery.includes(method);
              const methodLabels: Record<PaymentMethod, string> = {
                cash: 'Espèces',
                card_terminal: 'Terminal',
                card_online: 'En ligne',
              };
              return (
                <TouchableOpacity
                  key={method}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: isSelected ? currentTheme.pillActiveBg : currentTheme.border,
                    backgroundColor: isSelected ? (isDark ? currentTheme.surfaceMuted : currentTheme.surfaceMuted) : currentTheme.surface,
                  }}
                  onPress={() => togglePaymentMethod('delivery', method)}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: isSelected ? currentTheme.pillActiveBg : currentTheme.textSecondary,
                      backgroundColor: isSelected ? colors.accent : 'transparent',
                      marginRight: 12,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    {isSelected && <Text style={{ color: '#FFFFFF', fontSize: 12 }}>✓</Text>}
                  </View>
                  <Text style={{ fontSize: 16, color: currentTheme.textPrimary }}>{methodLabels[method]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <TouchableOpacity
            style={[
              styles.modalCloseButton,
              { backgroundColor: currentTheme.surfaceMuted },
              (saving || savingPaymentSettings) && { opacity: 0.6 },
            ]}
            onPress={handleCancelPaymentSettings}
            disabled={saving || savingPaymentSettings}
          >
            <Text style={[styles.modalCloseText, { color: currentTheme.textPrimary }]}>
              Annuler les changements
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalCloseButton, (saving || savingPaymentSettings) && { opacity: 0.6 }]}
            onPress={handleSavePaymentSettings}
            disabled={saving || savingPaymentSettings}
          >
            <Text style={styles.modalCloseText}>
              {savingPaymentSettings ? 'Sauvegarde…' : 'Sauvegarder les paramètres de paiement'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Restaurant Hours Section */}
      <View style={dynamicStyles.sectionCard}>
        <Text style={dynamicStyles.sectionTitle}>⏰ Horaires</Text>

        {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as Array<keyof RestaurantHours>).map((day) => {
          const dayHours = localRestaurantHours[day];
          const dayLabels: Record<keyof RestaurantHours, string> = {
            monday: 'Lundi',
            tuesday: 'Mardi',
            wednesday: 'Mercredi',
            thursday: 'Jeudi',
            friday: 'Vendredi',
            saturday: 'Samedi',
            sunday: 'Dimanche',
          };

          return (
            <View key={day} style={[dynamicStyles.modalSection, { marginBottom: 16 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[dynamicStyles.modalSectionTitle, { marginBottom: 0 }]}>{dayLabels[day]}</Text>
                <Switch
                  value={dayHours.enabled}
                  onValueChange={() => toggleDayEnabled(day)}
                  trackColor={{ false: currentTheme.surfaceMuted, true: currentTheme.pillActiveBg }}
                  thumbColor={currentTheme.surface}
                />
              </View>

              {dayHours.enabled && (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 4 }}>Ouverture</Text>
                    <TextInput
                      value={dayHours.open || ''}
                      onChangeText={(text) => updateDayHours(day, 'open', text)}
                      placeholder="09:00"
                      placeholderTextColor={currentTheme.textSecondary}
                      style={dynamicStyles.searchInput}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 4 }}>Fermeture</Text>
                    <TextInput
                      value={dayHours.close || ''}
                      onChangeText={(text) => updateDayHours(day, 'close', text)}
                      placeholder="17:00"
                      placeholderTextColor={currentTheme.textSecondary}
                      style={dynamicStyles.searchInput}
                    />
                  </View>
                </View>
              )}
            </View>
          );
        })}

        <View style={{ gap: 12 }}>
          <TouchableOpacity
            style={[
              styles.modalCloseButton,
              { backgroundColor: currentTheme.surfaceMuted },
              (saving || savingRestaurantHours) && { opacity: 0.6 },
            ]}
            onPress={handleCancelRestaurantHours}
            disabled={saving || savingRestaurantHours}
          >
            <Text style={[styles.modalCloseText, { color: currentTheme.textPrimary }]}>
              Annuler les changements
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalCloseButton, (saving || savingRestaurantHours) && { opacity: 0.6 }]}
            onPress={handleSaveRestaurantHours}
            disabled={saving || savingRestaurantHours}
          >
            <Text style={styles.modalCloseText}>
              {savingRestaurantHours ? 'Sauvegarde…' : 'Sauvegarder les horaires'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Distance Calculation Settings Section */}
      <View style={dynamicStyles.sectionCard}>
        <Text style={dynamicStyles.sectionTitle}>📍 Calcul de distance (ETA)</Text>

        <View style={dynamicStyles.modalSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={dynamicStyles.modalSectionTitle}>Activer le calcul de distance</Text>
              <Text style={{ fontSize: 12, color: currentTheme.textSecondary, marginTop: 4 }}>
                Affiche l'ETA et la distance aux livreurs
              </Text>
            </View>
            <Switch
              value={localDistanceSettings.distanceCalculationEnabled}
              onValueChange={(value) => setLocalDistanceSettings({ ...localDistanceSettings, distanceCalculationEnabled: value })}
              trackColor={{ false: currentTheme.surfaceMuted, true: currentTheme.pillActiveBg }}
              thumbColor={currentTheme.surface}
            />
          </View>
        </View>

        <View style={dynamicStyles.modalSection}>
          <Text style={dynamicStyles.modalSectionTitle}>Clé API Distance Matrix</Text>
          <Text style={{ fontSize: 12, color: currentTheme.textSecondary, marginBottom: 8 }}>
            Obtenez votre clé sur distancematrix.ai
          </Text>
          <TextInput
            value={localDistanceSettings.distanceMatrixApiKey || ''}
            onChangeText={(text) => setLocalDistanceSettings({ ...localDistanceSettings, distanceMatrixApiKey: text || null })}
            placeholder="Entrez votre clé API"
            placeholderTextColor={currentTheme.textSecondary}
            style={dynamicStyles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={false}
          />
          {localDistanceSettings.distanceCalculationEnabled && !localDistanceSettings.distanceMatrixApiKey && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
              ⚠️ Clé API requise pour activer le calcul de distance
            </Text>
          )}
        </View>

        <View style={{ gap: 12 }}>
          <TouchableOpacity
            style={[
              styles.modalCloseButton,
              { backgroundColor: currentTheme.surfaceMuted },
              (saving || savingDistanceSettings) && { opacity: 0.6 },
            ]}
            onPress={handleCancelDistanceSettings}
            disabled={saving || savingDistanceSettings}
          >
            <Text style={[styles.modalCloseText, { color: currentTheme.textPrimary }]}>
              Annuler les changements
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalCloseButton, (saving || savingDistanceSettings) && { opacity: 0.6 }]}
            onPress={handleSaveDistanceSettings}
            disabled={saving || savingDistanceSettings}
          >
            <Text style={styles.modalCloseText}>
              {savingDistanceSettings ? 'Sauvegarde…' : 'Sauvegarder les paramètres de distance'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Dark Mode Section */}
      {onToggleDarkMode && (
        <View style={dynamicStyles.sectionCard}>
          <Text style={dynamicStyles.sectionTitle}>🌙 Mode sombre</Text>

          <View style={dynamicStyles.modalSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={dynamicStyles.modalSectionTitle}>Activer le mode sombre</Text>
                <Text style={{ fontSize: 12, color: currentTheme.textSecondary, marginTop: 4 }}>
                  Adapte les couleurs de l'interface pour la nuit
                </Text>
              </View>
              <Switch
                value={darkModeEnabled}
                onValueChange={onToggleDarkMode}
                trackColor={{ false: currentTheme.surfaceMuted, true: currentTheme.pillActiveBg }}
                thumbColor={currentTheme.surface}
              />
            </View>
          </View>
        </View>
      )}

      {/* Logout Button */}
      {onLogout && (
        <View style={dynamicStyles.sectionCard}>
          <TouchableOpacity
            style={[
              styles.modalCloseButton,
              { backgroundColor: '#DC2626', marginTop: 0 },
            ]}
            onPress={onLogout}
          >
            <Text style={[styles.modalCloseText, { color: '#FFFFFF' }]}>
              Se déconnecter
            </Text>
          </TouchableOpacity>
        </View>
      )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


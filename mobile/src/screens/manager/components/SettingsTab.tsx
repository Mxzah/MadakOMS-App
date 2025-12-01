import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../../kitchen/constants';
import type { OrderingSettings, RestaurantInfo } from '../types';
import { useDeliveryZones } from '../hooks/useDeliveryZones';
import { styles } from '../styles';

type SettingsTabProps = {
  restaurantInfo: RestaurantInfo;
  orderingSettings: OrderingSettings;
  loading: boolean;
  saving: boolean;
  restaurantId: string;
  onUpdateRestaurantInfo: (info: RestaurantInfo) => Promise<boolean>;
  onUpdateOrderingSettings: (settings: OrderingSettings) => Promise<boolean>;
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
}: SettingsTabProps) {
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

  const [localDeliveryZoneSettings, setLocalDeliveryZoneSettings] = useState({
    deliveryZonesGeoJson: deliveryZones.deliveryZonesGeoJson,
  });
  const [deliveryZonesGeojsonError, setDeliveryZonesGeojsonError] = useState<string | undefined>(undefined);

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

  if (loading || deliveryZonesLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
      {/* Restaurant Info Section */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>⚙️ Restaurant Info</Text>

        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>Nom</Text>
          <TextInput
            value={localRestaurantInfo.name}
            onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, name: text })}
            placeholder="Nom du restaurant"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>Téléphone</Text>
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
            placeholderTextColor={colors.muted}
            style={[
              styles.searchInput,
              phoneError && { borderColor: '#EF4444', borderWidth: 1 },
            ]}
            keyboardType="default"
          />
          {phoneError && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
              {phoneError}
            </Text>
          )}
          {!phoneError && localRestaurantInfo.phone && (
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
              Format valide
            </Text>
          )}
        </View>

        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>Email</Text>
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
            placeholderTextColor={colors.muted}
            style={[
              styles.searchInput,
              emailError && { borderColor: '#EF4444', borderWidth: 1 },
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
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
              Format valide
            </Text>
          )}
        </View>

        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>Adresse</Text>
          <TextInput
            value={localRestaurantInfo.addressLine1 || ''}
            onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, addressLine1: text || null })}
            placeholder="Ligne 1"
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { marginBottom: 8 }]}
          />
          <TextInput
            value={localRestaurantInfo.addressLine2 || ''}
            onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, addressLine2: text || null })}
            placeholder="Ligne 2 (optionnel)"
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { marginBottom: 8 }]}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={localRestaurantInfo.city || ''}
              onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, city: text || null })}
              placeholder="Ville"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { flex: 1 }]}
            />
            <TextInput
              value={localRestaurantInfo.province || ''}
              onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, province: text || null })}
              placeholder="Province"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { flex: 1 }]}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput
              value={localRestaurantInfo.postalCode || ''}
              onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, postalCode: text || null })}
              placeholder="Code postal"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { flex: 1 }]}
            />
            <TextInput
              value={localRestaurantInfo.country || ''}
              onChangeText={(text) => setLocalRestaurantInfo({ ...localRestaurantInfo, country: text || null })}
              placeholder="Pays"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { flex: 1 }]}
            />
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <TouchableOpacity
            style={[
              styles.modalCloseButton,
              { backgroundColor: '#E5E7EB' },
              (saving || savingInfo) && { opacity: 0.6 },
            ]}
            onPress={handleCancelRestaurantInfo}
            disabled={saving || savingInfo}
          >
            <Text style={[styles.modalCloseText, { color: '#374151' }]}>
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
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>📦 Paramètres de commande</Text>

        <View style={styles.modalSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.modalSectionTitle}>Commandes activées</Text>
            <Switch
              value={localOrderingSettings.orderingEnabled}
              onValueChange={(value) => setLocalOrderingSettings({ ...localOrderingSettings, orderingEnabled: value })}
              trackColor={{ false: '#E5E7EB', true: colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={styles.modalSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.modalSectionTitle}>À emporter activé</Text>
            <Switch
              value={localOrderingSettings.pickupEnabled}
              onValueChange={(value) => setLocalOrderingSettings({ ...localOrderingSettings, pickupEnabled: value })}
              trackColor={{ false: '#E5E7EB', true: colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={styles.modalSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.modalSectionTitle}>Livraison activée</Text>
            <Switch
              value={localOrderingSettings.deliveryEnabled}
              onValueChange={(value) => setLocalOrderingSettings({ ...localOrderingSettings, deliveryEnabled: value })}
              trackColor={{ false: '#E5E7EB', true: colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>Montant minimum - À emporter</Text>
          <TextInput
            value={localOrderingSettings.minOrderAmountPickup?.toString() || ''}
            onChangeText={(text) => {
              const num = text ? parseFloat(text) : null;
              setLocalOrderingSettings({ ...localOrderingSettings, minOrderAmountPickup: num });
            }}
            placeholder="0.00"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>Montant minimum - Livraison</Text>
          <TextInput
            value={localOrderingSettings.minOrderAmountDelivery?.toString() || ''}
            onChangeText={(text) => {
              const num = text ? parseFloat(text) : null;
              setLocalOrderingSettings({ ...localOrderingSettings, minOrderAmountDelivery: num });
            }}
            placeholder="0.00"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>Temps de préparation estimé (minutes)</Text>
          <TextInput
            value={localOrderingSettings.estimatedPrepTimeMinutes?.toString() || ''}
            onChangeText={(text) => {
              const num = text ? parseInt(text, 10) : null;
              setLocalOrderingSettings({ ...localOrderingSettings, estimatedPrepTimeMinutes: num });
            }}
            placeholder="20"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>Temps de livraison estimé (minutes)</Text>
          <TextInput
            value={localOrderingSettings.estimatedDeliveryTimeMinutes?.toString() || ''}
            onChangeText={(text) => {
              const num = text ? parseInt(text, 10) : null;
              setLocalOrderingSettings({ ...localOrderingSettings, estimatedDeliveryTimeMinutes: num });
            }}
            placeholder="30"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            keyboardType="numeric"
          />
        </View>

        <View style={{ gap: 12 }}>
          <TouchableOpacity
            style={[
              styles.modalCloseButton,
              { backgroundColor: '#E5E7EB' },
              (saving || savingSettings) && { opacity: 0.6 },
            ]}
            onPress={handleCancelOrderingSettings}
            disabled={saving || savingSettings}
          >
            <Text style={[styles.modalCloseText, { color: '#374151' }]}>
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
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>📍 Zones de livraison</Text>

        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>Zones GeoJSON</Text>
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
            placeholderTextColor={colors.muted}
            style={[
              styles.searchInput,
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
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
              GeoJSON valide
            </Text>
          )}
        </View>

        <View style={{ gap: 12 }}>
          <TouchableOpacity
            style={[
              styles.modalCloseButton,
              { backgroundColor: '#E5E7EB' },
              (saving || savingDeliveryZones) && { opacity: 0.6 },
            ]}
            onPress={handleCancelDeliveryZones}
            disabled={saving || savingDeliveryZones}
          >
            <Text style={[styles.modalCloseText, { color: '#374151' }]}>
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


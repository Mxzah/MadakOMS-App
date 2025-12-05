import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import type { KitchenOrder } from '../../../types/orders';
import { formatAddress, formatDateTime, getCustomerEmail, getCustomerName, getCustomerPhone } from '../../../utils/orderHelpers';
import { processRefund } from '../../../utils/refundHelpers';
import { colors } from '../../kitchen/constants';
import { styles } from '../styles';
import type { KitchenTheme } from '../../kitchen/types';

type OrderDetailModalProps = {
  order: KitchenOrder | null;
  onClose: () => void;
  theme?: KitchenTheme;
  isDark?: boolean;
};

export function OrderDetailModal({ order, onClose, theme, isDark = false }: OrderDetailModalProps) {
  const [refunding, setRefunding] = useState(false);

  if (!order) return null;

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

  // Vérifier si la commande peut être remboursée (payée en ligne)
  const canRefund = order.paymentMethod === 'card_online';

  const handleRefund = async () => {
    if (!order) return;

    Alert.alert(
      'Confirmer le remboursement',
      `Voulez-vous vraiment rembourser la commande #${order.orderNumber ?? '—'} ?\n\nLe client sera remboursé via Stripe.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Rembourser',
          style: 'destructive',
          onPress: async () => {
            try {
              setRefunding(true);
              const result = await processRefund(order.id);

              if (result?.success) {
                Alert.alert(
                  'Remboursement effectué',
                  result.action === 'already_refunded'
                    ? 'Cette commande avait déjà été remboursée.'
                    : `Le remboursement de ${result.amount ? `$${result.amount.toFixed(2)}` : 'la commande'} a été traité avec succès.`,
                  [{ text: 'OK', onPress: onClose }]
                );
              } else {
                Alert.alert(
                  'Erreur',
                  result?.error || 'Impossible de traiter le remboursement. Veuillez réessayer.',
                  [{ text: 'OK' }]
                );
              }
            } catch (error) {
              Alert.alert(
                'Erreur',
                'Une erreur est survenue lors du remboursement. Veuillez réessayer.',
                [{ text: 'OK' }]
              );
            } finally {
              setRefunding(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={Boolean(order)} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.modalSheet,
            { backgroundColor: currentTheme.surface },
          ]}
        >
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={[styles.modalTitle, { color: currentTheme.textPrimary }]}>
              Commande #{order.orderNumber ?? '—'} ·{' '}
              {order.fulfillment === 'delivery' ? 'Livraison' : 'À emporter'}
            </Text>
            <Text style={[styles.modalMeta, { color: currentTheme.textSecondary }]}>
              Placée {formatDateTime(order.placedAt)}
            </Text>

            <View style={[styles.modalSection, { backgroundColor: currentTheme.surfaceMuted }]}>
              <Text style={[styles.modalSectionTitle, { color: currentTheme.textPrimary }]}>
                Client
              </Text>
              <Text style={[styles.modalText, { color: currentTheme.textPrimary }]}>
                {getCustomerName(order)}
              </Text>
              <Text style={[styles.modalSubText, { color: currentTheme.textSecondary }]}>
                Tél. {getCustomerPhone(order)}
              </Text>
              {getCustomerEmail(order) ? (
                <Text style={[styles.modalSubText, { color: currentTheme.textSecondary }]}>
                  Courriel : {getCustomerEmail(order)}
                </Text>
              ) : null}
              {order.deliveryAddress ? (
                <Text style={[styles.modalSubText, { color: currentTheme.textSecondary }]}>
                  {formatAddress(order.deliveryAddress)}
                </Text>
              ) : null}
            </View>

            <View style={[styles.modalSection, { backgroundColor: currentTheme.surfaceMuted }]}>
              <Text style={[styles.modalSectionTitle, { color: currentTheme.textPrimary }]}>
                Articles
              </Text>
              {order.items.map((item) => (
                <View key={item.id} style={styles.modalItemRow}>
                  <Text style={[styles.modalText, { color: currentTheme.textPrimary }]}>
                    {item.quantity} × {item.name}
                  </Text>
                </View>
              ))}
            </View>

            {canRefund && (
              <TouchableOpacity
                style={[
                  styles.modalCloseButton,
                  { 
                    backgroundColor: '#DC2626',
                    marginBottom: 8,
                    opacity: refunding ? 0.6 : 1,
                  },
                ]}
                onPress={handleRefund}
                disabled={refunding}
              >
                {refunding ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={[styles.modalCloseText, { color: '#FFFFFF' }]}>
                    Rembourser
                  </Text>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.modalCloseButton,
                { backgroundColor: currentTheme.pillActiveBg },
              ]}
              onPress={onClose}
            >
              <Text style={[styles.modalCloseText, { color: currentTheme.pillActiveText }]}>
                Fermer
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}


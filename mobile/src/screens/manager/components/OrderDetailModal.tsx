import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { KitchenOrder } from '../../../types/orders';
import { formatAddress, formatDateTime, getCustomerEmail, getCustomerName, getCustomerPhone } from '../../../utils/orderHelpers';
import { colors } from '../../kitchen/constants';
import { styles } from '../styles';

type OrderDetailModalProps = {
  order: KitchenOrder | null;
  onClose: () => void;
};

export function OrderDetailModal({ order, onClose }: OrderDetailModalProps) {
  if (!order) return null;

  return (
    <Modal visible={Boolean(order)} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Commande #{order.orderNumber ?? '—'} ·{' '}
              {order.fulfillment === 'delivery' ? 'Livraison' : 'À emporter'}
            </Text>
            <Text style={styles.modalMeta}>Placée {formatDateTime(order.placedAt)}</Text>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Client</Text>
              <Text style={styles.modalText}>{getCustomerName(order)}</Text>
              <Text style={styles.modalSubText}>Tél. {getCustomerPhone(order)}</Text>
              {getCustomerEmail(order) ? (
                <Text style={styles.modalSubText}>Courriel : {getCustomerEmail(order)}</Text>
              ) : null}
              {order.deliveryAddress ? (
                <Text style={styles.modalSubText}>{formatAddress(order.deliveryAddress)}</Text>
              ) : null}
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Articles</Text>
              {order.items.map((item) => (
                <View key={item.id} style={styles.modalItemRow}>
                  <Text style={styles.modalText}>
                    {item.quantity} × {item.name}
                  </Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
              <Text style={styles.modalCloseText}>Fermer</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}


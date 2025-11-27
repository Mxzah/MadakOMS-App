import { KitchenOrder, KitchenStatus, HistoryOrder } from '../types/orders';

export const ORDER_DETAIL_SELECT = `
  id,
  order_number,
  status,
  fulfillment,
  placed_at,
  scheduled_at,
  pickup_name,
  pickup_phone,
  delivery_address,
  cook_id,
  cook:staff_users!cook_id (
    username
  ),
  customers:customer_id (
    first_name,
    phone,
    email
  ),
  payments!order_id (
    method
  ),
  order_items (
    id,
    name,
    quantity,
    order_item_modifiers (
      modifier_name,
      option_name
    )
  )
`;

export const deriveDistance = (seed: number) =>
  `${(2 + (Math.abs(seed) % 6) + 0.3).toFixed(1)} km`;

export const deriveEta = (seed: number) => `${8 + (Math.abs(seed) % 9)} min`;

export const getCityFromAddress = (address: string) => {
  if (!address) return '';
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[1] ?? parts[parts.length - 1] ?? '';
};

export const formatDateTime = (isoString: string | null) => {
  if (!isoString) {
    return '—';
  }
  const date = new Date(isoString);
  return date.toLocaleString('fr-CA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getPriorityFlags = (order: KitchenOrder) => {
  const flags: Array<{ label: string; type: 'late' | 'soon' }> = [];
  const now = Date.now();
  const placed = new Date(order.placedAt).getTime();
  const scheduled = order.scheduledAt ? new Date(order.scheduledAt).getTime() : null;

  const lateThreshold = order.fulfillment === 'delivery' ? 15 : 10; // minutes
  if (
    (order.status === 'received' || order.status === 'preparing') &&
    now - placed > lateThreshold * 60000
  ) {
    flags.push({ label: 'Retard', type: 'late' });
  }

  if (scheduled && scheduled - now < 15 * 60000 && scheduled > now) {
    flags.push({ label: 'Prévu bientôt', type: 'soon' });
  }

  return flags;
};

export const formatAddress = (address?: Record<string, any> | null) => {
  if (!address) return '';
  const parts = [address.line1, address.city, address.postal_code].filter(Boolean);
  return parts.join(', ');
};

export const getCustomerName = (order: KitchenOrder) => {
  if (order.fulfillment === 'pickup') {
    return order.pickupName || order.customer?.first_name || 'Client';
  }
  return order.deliveryAddress?.name || order.customer?.first_name || 'Client';
};

export const getCustomerPhone = (order: KitchenOrder) => {
  if (order.fulfillment === 'pickup') {
    return order.pickupPhone || order.customer?.phone || '—';
  }
  return order.deliveryAddress?.phone || order.customer?.phone || '—';
};

export const getCustomerEmail = (order: KitchenOrder) => {
  return order.customer?.email || null;
};

export const formatPaymentMethod = (method: string | null | undefined): string => {
  if (!method) return '—';
  
  const methodMap: Record<string, string> = {
    card_online: 'Carte en ligne',
    card_terminal: 'Carte au terminal',
    cash: 'Espèces',
  };
  
  return methodMap[method.toLowerCase()] || method;
};

export const mapOrderRowToKitchenOrder = (row: any): KitchenOrder => {
  const customerRaw = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const cookRaw = Array.isArray(row.cook) ? row.cook[0] : row.cook;
  const paymentRaw = Array.isArray(row.payments) ? row.payments[0] : row.payments;
  return {
    id: row.id,
    orderNumber: row.order_number ?? null,
    status: row.status as KitchenStatus,
    fulfillment: row.fulfillment,
    placedAt: row.placed_at,
    scheduledAt: row.scheduled_at,
    pickupName: row.pickup_name,
    pickupPhone: row.pickup_phone,
    deliveryAddress: row.delivery_address,
    cookId: row.cook_id ?? null,
    cookName: cookRaw?.username ?? null,
    customer: customerRaw
      ? {
          first_name: customerRaw.first_name,
          phone: customerRaw.phone,
          email: customerRaw.email,
        }
      : null,
    paymentMethod: paymentRaw?.method ?? null,
    items:
      row.order_items?.map((item: any) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        modifiers: item.order_item_modifiers ?? [],
      })) ?? [],
  };
};

export const extractRestaurantName = (
  restaurantField: { name?: string } | null | Array<{ name?: string }>
) => {
  if (Array.isArray(restaurantField)) {
    return restaurantField[0]?.name ?? 'Restaurant';
  }
  return restaurantField?.name ?? 'Restaurant';
};

export const historySubtitle = (order: HistoryOrder) => {
  if (order.status === 'completed' && order.completedAt) {
    return `Terminée ${formatDateTime(order.completedAt)}`;
  }
  if (order.status === 'cancelled' && order.cancelledAt) {
    return `Annulée ${formatDateTime(order.cancelledAt)}`;
  }
  return `Modifiée ${formatDateTime(order.updatedAt)}`;
};

export const historyStatusStyle = (status: string) => {
  switch (status) {
    case 'completed':
      return { backgroundColor: '#DCFCE7', color: '#15803D' };
    case 'cancelled':
      return { backgroundColor: '#FEE2E2', color: '#B91C1C' };
    default:
      return { backgroundColor: '#1D4ED8', color: '#FFFFFF' };
  }
};


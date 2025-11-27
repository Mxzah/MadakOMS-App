export type AssignedOrder = {
  id: string;
  orderNumber: number | null;
  restaurantName: string;
  customerName: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress: string;
  itemsSummary: string;
  fulfillment: 'delivery' | 'pickup';
  paymentInfo: 'paid_online' | 'pay_on_delivery';
  eta?: string;
  distance?: string;
  status: 'assigned' | 'ready' | 'pickup' | 'enroute' | 'completed' | 'failed' | 'cancelled';
  driverId?: string | null;
  driverName?: string | null;
};

export type AvailableOrder = {
  id: string;
  orderNumber: number;
  city: string;
  streetLabel: string;
  address: string;
  distance: string;
  eta: string;
  status: AssignedOrder['status'];
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  itemsSummary?: string | null;
};

export type KitchenBoardStatus = 'received' | 'preparing' | 'ready';
export type KitchenStatus = KitchenBoardStatus | 'completed' | 'cancelled' | 'enroute' | 'failed';

export type KitchenOrder = {
  id: string;
  orderNumber: number | null;
  status: KitchenStatus;
  fulfillment: 'delivery' | 'pickup';
  placedAt: string;
  scheduledAt: string | null;
  pickupName?: string | null;
  pickupPhone?: string | null;
  deliveryAddress?: Record<string, any> | null;
  cookId?: string | null;
  cookName?: string | null;
  customer?: {
    first_name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    modifiers?: Array<{ modifier_name: string; option_name: string }>;
  }>;
};

export type HistoryOrder = {
  id: string;
  orderNumber: number | null;
  status: string;
  fulfillment: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  placedAt: string;
  cookName?: string | null;
};


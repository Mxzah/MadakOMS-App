import type { KitchenOrder, KitchenStatus } from '../../types/orders';

export type ManagerViewProps = {
  staff: {
    restaurantId: string;
    restaurantName: string;
    role: string;
    staffUserId: string;
  };
  onLogout: () => void;
};

export type DateFilterId = 'today' | 'yesterday' | 'week' | 'month';
export type FulfillmentFilterId = 'all' | 'delivery' | 'pickup';
export type ManagerTabId = 'orders' | 'staff' | 'settings' | 'analytics';

export type StaffUser = {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  authUserId: string;
  workScheduleEnabled?: boolean;
  workSchedule?: any;
};

export type StatusSection = {
  id: KitchenStatus | 'cancelled_failed';
  label: string;
};

export type DaySchedule = {
  enabled: boolean;
  start: string;
  end: string;
};

export type WorkSchedule = Record<string, DaySchedule>;

export type RestaurantInfo = {
  name: string;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
};

export type OrderingSettings = {
  orderingEnabled: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  minOrderAmountPickup: number | null;
  minOrderAmountDelivery: number | null;
  estimatedPrepTimeMinutes: number | null;
  estimatedDeliveryTimeMinutes: number | null;
};

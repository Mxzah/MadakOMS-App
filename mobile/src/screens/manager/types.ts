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
export type ManagerTabId = 'orders' | 'staff' | 'settings';

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


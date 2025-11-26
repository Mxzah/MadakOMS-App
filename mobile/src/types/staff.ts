export type RoleId = 'cook' | 'delivery' | 'manager';

export type StaffSession = {
  role: RoleId;
  restaurantId: string;
  restaurantName: string;
  staffUserId: string;
};


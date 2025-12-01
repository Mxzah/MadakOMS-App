import type { KitchenStatus } from '../../types/orders';
import type { StatusSection } from './types';

export const STATUS_SECTIONS: StatusSection[] = [
  { id: 'received', label: 'Reçues' },
  { id: 'preparing', label: 'En préparation' },
  { id: 'ready', label: 'Prêtes' },
  { id: 'assigned', label: 'Assignées' },
  { id: 'enroute', label: 'En route' },
  { id: 'completed', label: 'Terminées' },
  { id: 'cancelled_failed', label: 'Annulées / Échouées' },
];

export const STAFF_EMAIL_DOMAIN = '@madak.internal';


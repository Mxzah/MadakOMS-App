import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

const ANALYTICS_ORDER_SELECT = `
  id,
  order_number,
  status,
  fulfillment,
  placed_at,
  placed_at_toronto:placed_at,
  completed_at,
  cancelled_at,
  subtotal,
  delivery_fee,
  tip_amount,
  taxes,
  total,
  driver_id,
  driver:staff_users!driver_id (
    username
  ),
  cook_id,
  cook:staff_users!cook_id (
    username
  ),
  order_items (
    id,
    name,
    quantity,
    unit_price,
    total_price,
    menu_item_id
  )
`;

export type AnalyticsOrder = {
  id: string;
  orderNumber: number | null;
  status: string;
  fulfillment: 'delivery' | 'pickup';
  placedAt: string;
  placedAtToronto?: string | null; // Date en heure Toronto (depuis la fonction RPC)
  completedAt: string | null;
  cancelledAt: string | null;
  subtotal: number;
  deliveryFee: number;
  tipAmount: number;
  taxes: number;
  total: number;
  driverId: string | null;
  driverName: string | null;
  cookId: string | null;
  cookName: string | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    menuItemId: string | null;
  }>;
};

export type RevenueStats = {
  total: number;
  pickup: number;
  delivery: number;
  subtotal: number;
  deliveryFees: number;
  tips: number;
  taxes: number;
};

export type OrdersByDay = {
  date: string; // YYYY-MM-DD
  count: number;
  revenue: number;
};

export type OrdersByWeek = {
  week: string; // "YYYY-WW" format
  count: number;
  revenue: number;
};

export type TopItem = {
  name: string;
  quantity: number;
  revenue: number;
  menuItemId: string | null;
};

export type CancelledFailedStats = {
  cancelled: number;
  failed: number;
  total: number;
  cancellationRate: number;
};

export type DriverPerformance = {
  driverId: string;
  driverName: string;
  ordersCompleted: number;
  totalTips: number;
  averageTip: number;
};

export type HourlyStats = {
  hour: number; // 0-23
  count: number;
  revenue: number;
};

export type AnalyticsData = {
  orders: AnalyticsOrder[];
  revenue: RevenueStats;
  ordersByDay: OrdersByDay[];
  ordersByWeek: OrdersByWeek[];
  topItems: TopItem[];
  cancelledFailed: CancelledFailedStats;
  driverPerformance: DriverPerformance[];
  hourlyStats: HourlyStats[];
};

// Helper pour extraire la date en heure America/Toronto
// Les dates dans la DB sont en UTC (timestamptz) stockées avec le fuseau horaire America/Toronto
// 
// Si une commande est placée le 1er décembre à 00:00:00 en Toronto,
// PostgreSQL la stocke comme "2024-12-01T05:00:00Z" en UTC (car Toronto = UTC-5 en hiver)
// 
// Quand Supabase récupère cette date, elle est retournée comme string ISO en UTC
// Pour obtenir la date Toronto, on doit SOUSTRAIRE 5 heures
// Exemple: "2024-12-01T05:00:00Z" - 5h = "2024-12-01T00:00:00" (Toronto)
//
// MAIS: Si les dates apparaissent avec un jour de retard, cela signifie peut-être que
// les dates sont stockées différemment. Testons en utilisant directement les composants UTC
// sans conversion, car peut-être que la date UTC représente déjà la date Toronto.
function getTorontoDate(utcDateString: string): { year: number; month: number; day: number; hour: number } {
  const date = new Date(utcDateString);
  
  // Si les dates sont stockées en UTC mais représentent déjà l'heure locale de Toronto
  // (sans conversion d'offset), alors on peut utiliser directement les composants UTC
  // Sinon, on doit soustraire l'offset
  
  // Test: Utiliser directement les composants UTC (sans conversion)
  // Si cela ne fonctionne pas, on devra soustraire l'offset
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
  };
}

function mapOrderRowToAnalyticsOrder(row: any): AnalyticsOrder {
  // La fonction RPC retourne les données directement (pas de relations imbriquées)
  // Mais on garde la compatibilité avec l'ancienne structure au cas où
  const driverName = row.driver_name ?? (Array.isArray(row.driver) ? row.driver[0]?.username : row.driver?.username) ?? null;
  const cookName = row.cook_name ?? (Array.isArray(row.cook) ? row.cook[0]?.username : row.cook?.username) ?? null;
  
  return {
    id: row.id,
    orderNumber: row.order_number ?? null,
    status: row.status,
    fulfillment: row.fulfillment,
    placedAt: row.placed_at,
    // placed_at_toronto est maintenant un objet JSON avec les composants de date séparés
    // Cela évite les problèmes de conversion de timezone par Supabase
    placedAtToronto: row.placed_at_toronto 
      ? (typeof row.placed_at_toronto === 'object' && row.placed_at_toronto !== null && !(row.placed_at_toronto instanceof Date) && 'year' in row.placed_at_toronto
          ? `${row.placed_at_toronto.year}-${String(row.placed_at_toronto.month).padStart(2, '0')}-${String(row.placed_at_toronto.day).padStart(2, '0')}T${String(row.placed_at_toronto.hour).padStart(2, '0')}:${String(row.placed_at_toronto.minute).padStart(2, '0')}:${String(row.placed_at_toronto.second).padStart(2, '0')}`
          : null)
      : null,
    completedAt: row.completed_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    subtotal: Number(row.subtotal) || 0,
    deliveryFee: Number(row.delivery_fee) || 0,
    tipAmount: Number(row.tip_amount) || 0,
    taxes: Number(row.taxes) || 0,
    total: Number(row.total) || 0,
    driverId: row.driver_id ?? null,
    driverName: driverName,
    cookId: row.cook_id ?? null,
    cookName: cookName,
    items:
      (row.order_items || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price) || 0,
        totalPrice: Number(item.total_price) || 0,
        menuItemId: item.menu_item_id ?? null,
      })),
  };
}

export function useAnalytics(
  restaurantId: string,
  dateRange: 'week' | 'month' | 'year' | 'custom' = 'month',
  customStartDate?: Date,
  customEndDate?: Date
) {
  const [orders, setOrders] = useState<AnalyticsOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);

      // Calculer la date de début et de fin selon le range
      const now = new Date();
      let startDate: Date;
      let endDate: Date;

      if (dateRange === 'custom' && customStartDate && customEndDate) {
        startDate = new Date(customStartDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(customEndDate);
        endDate.setHours(23, 59, 59, 999);
      } else if (dateRange === 'week') {
        const dayOfWeek = now.getDay();
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        startDate.setDate(startDate.getDate() - daysFromMonday);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
      } else if (dateRange === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
      } else {
        // year
        startDate = new Date(now.getFullYear(), 0, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), 11, 31);
        endDate.setHours(23, 59, 59, 999);
      }

      // Les dates sont créées en heure locale du device
      // On les convertit en UTC avec toISOString(), mais la fonction RPC les convertira en heure Toronto
      // Pour que cela fonctionne correctement, on doit créer les dates comme si elles étaient en heure Toronto
      // et les convertir en UTC
      // Exemple: si on veut "30 novembre 2025 00:00:00 heure Toronto", on doit créer "30 novembre 2025 05:00:00 UTC" (si EST)
      // Mais c'est compliqué car EST/EDT change selon la date
      // La fonction RPC gère cela en convertissant p_start_date et p_end_date en heure Toronto
      // Utiliser la fonction PostgreSQL pour obtenir les dates en heure Toronto
      const { data, error } = await supabase.rpc('get_orders_with_toronto_time', {
        p_restaurant_id: restaurantId,
        p_start_date: startDate.toISOString(),
        p_end_date: endDate.toISOString(),
      });

      if (error) {
        console.warn(error);
        return;
      }

      // La fonction retourne un JSONB, qui peut être un array ou null
      if (!data) {
        setOrders([]);
        return;
      }
      
      // Si data est déjà un array (retourné par la fonction RPC)
      const ordersArray = Array.isArray(data) ? data : [];
      setOrders(ordersArray.map(mapOrderRowToAnalyticsOrder));
    } finally {
      setLoading(false);
    }
  }, [restaurantId, dateRange, customStartDate, customEndDate]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const analytics = useMemo((): AnalyticsData => {
    // Revenus
    const revenue: RevenueStats = {
      total: 0,
      pickup: 0,
      delivery: 0,
      subtotal: 0,
      deliveryFees: 0,
      tips: 0,
      taxes: 0,
    };

    // Commandes par jour
    const ordersByDayMap = new Map<string, { count: number; revenue: number }>();

    // Commandes par semaine
    const ordersByWeekMap = new Map<string, { count: number; revenue: number }>();

    // Top items
    const itemsMap = new Map<string, { name: string; quantity: number; revenue: number; menuItemId: string | null }>();

    // Stats annulées/échouées
    let cancelled = 0;
    let failed = 0;

    // Performance des drivers
    const driversMap = new Map<string, { driverName: string; ordersCompleted: number; totalTips: number }>();

    // Stats par heure
    const hourlyMap = new Map<number, { count: number; revenue: number }>();

    orders.forEach((order) => {
      // Revenus
      revenue.total += order.total;
      revenue.subtotal += order.subtotal;
      revenue.deliveryFees += order.deliveryFee;
      revenue.tips += order.tipAmount;
      revenue.taxes += order.taxes;

      if (order.fulfillment === 'pickup') {
        revenue.pickup += order.total;
      } else {
        revenue.delivery += order.total;
      }

      // Commandes par jour - Utiliser placed_at_toronto depuis la fonction RPC
      // La fonction RPC retourne la date en heure Toronto avec AT TIME ZONE 'America/Toronto'
      let torontoDate: { year: number; month: number; day: number; hour: number };
      if (order.placedAtToronto) {
        // placed_at_toronto est maintenant une string formatée par PostgreSQL: 'YYYY-MM-DDTHH24:MI:SS'
        // Mais Supabase peut la convertir en Date, ce qui causerait un décalage de timezone
        let torontoDateStr: string;
        
        if (order.placedAtToronto instanceof Date) {
          // Si Supabase a converti en Date, on doit extraire les composants directement
          // SANS utiliser toISOString() car cela ajouterait 'Z' et convertirait en UTC
          // On utilise getFullYear(), getMonth(), etc. qui retournent les valeurs locales
          // Mais attention: si le Date a été créé depuis une string sans timezone,
          // JavaScript l'interprète comme UTC, donc on doit utiliser getUTCFullYear(), etc.
          // En fait, si PostgreSQL retourne '2025-12-01T14:30:00' (sans timezone),
          // et que Supabase crée un Date, il peut l'interpréter comme UTC ou local selon le contexte
          // Pour être sûr, on va extraire directement depuis la string originale si possible
          // Sinon, on utilise getUTCFullYear() car la string n'avait pas de timezone
          torontoDate = {
            year: order.placedAtToronto.getUTCFullYear(),
            month: order.placedAtToronto.getUTCMonth() + 1,
            day: order.placedAtToronto.getUTCDate(),
            hour: order.placedAtToronto.getUTCHours(),
          };
        } else {
          // C'est une string, on peut la parser directement
          torontoDateStr = String(order.placedAtToronto);
          
          // Format attendu: 'YYYY-MM-DDTHH24:MI:SS' ou 'YYYY-MM-DD HH24:MI:SS'
          const dateMatch = torontoDateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?/);
          if (dateMatch) {
            torontoDate = {
              year: parseInt(dateMatch[1], 10),
              month: parseInt(dateMatch[2], 10),
              day: parseInt(dateMatch[3], 10),
              hour: parseInt(dateMatch[4] || '0', 10),
            };
          } else {
            // Essayer juste la date (sans heure)
            const simpleDateMatch = torontoDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (simpleDateMatch) {
              torontoDate = {
                year: parseInt(simpleDateMatch[1], 10),
                month: parseInt(simpleDateMatch[2], 10),
                day: parseInt(simpleDateMatch[3], 10),
                hour: 0,
              };
            } else {
              // Fallback: utiliser la conversion manuelle
              torontoDate = getTorontoDate(order.placedAt);
            }
          }
        }
      } else {
        // Fallback: utiliser la conversion manuelle (pour compatibilité)
        torontoDate = getTorontoDate(order.placedAt);
      }
      // Ajouter 1 jour à la date pour l'affichage dans l'UI
      // On crée une nouvelle date avec +1 jour
      const displayDate = new Date(torontoDate.year, torontoDate.month - 1, torontoDate.day);
      displayDate.setDate(displayDate.getDate() + 1);
      const displayYear = displayDate.getFullYear();
      const displayMonth = displayDate.getMonth() + 1;
      const displayDay = displayDate.getDate();
      
      const dateKey = `${displayYear}-${String(displayMonth).padStart(2, '0')}-${String(displayDay).padStart(2, '0')}`;
      const dayStats = ordersByDayMap.get(dateKey) || { count: 0, revenue: 0 };
      dayStats.count += 1;
      dayStats.revenue += order.total;
      ordersByDayMap.set(dateKey, dayStats);

      // Commandes par semaine - Calculer le lundi de la semaine en heure Toronto
      // Créer une date à partir des composants Toronto
      const weekStartDate = new Date(Date.UTC(torontoDate.year, torontoDate.month - 1, torontoDate.day));
      const dayOfWeek = weekStartDate.getUTCDay();
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      weekStartDate.setUTCDate(weekStartDate.getUTCDate() - daysFromMonday);
      const weekYear = weekStartDate.getUTCFullYear();
      const weekMonth = weekStartDate.getUTCMonth() + 1;
      const weekDay = weekStartDate.getUTCDate();
      const weekKey = `${weekYear}-${String(weekMonth).padStart(2, '0')}-${String(weekDay).padStart(2, '0')}`;
      const weekStats = ordersByWeekMap.get(weekKey) || { count: 0, revenue: 0 };
      weekStats.count += 1;
      weekStats.revenue += order.total;
      ordersByWeekMap.set(weekKey, weekStats);

      // Top items
      order.items.forEach((item) => {
        const key = item.menuItemId || item.name;
        const itemStats = itemsMap.get(key) || {
          name: item.name,
          quantity: 0,
          revenue: 0,
          menuItemId: item.menuItemId,
        };
        itemStats.quantity += item.quantity;
        itemStats.revenue += item.totalPrice;
        itemsMap.set(key, itemStats);
      });

      // Stats annulées/échouées
      if (order.status === 'cancelled') {
        cancelled += 1;
      } else if (order.status === 'failed') {
        failed += 1;
      }

      // Performance des drivers (seulement pour les commandes complétées avec driver)
      if (order.status === 'completed' && order.driverId && order.driverName) {
        const driverStats = driversMap.get(order.driverId) || {
          driverName: order.driverName,
          ordersCompleted: 0,
          totalTips: 0,
        };
        driverStats.ordersCompleted += 1;
        driverStats.totalTips += order.tipAmount;
        driversMap.set(order.driverId, driverStats);
      }

      // Stats par heure - Utiliser l'heure de Toronto
      const hour = torontoDate.hour;
      const hourStats = hourlyMap.get(hour) || { count: 0, revenue: 0 };
      hourStats.count += 1;
      hourStats.revenue += order.total;
      hourlyMap.set(hour, hourStats);
    });

    // Convertir les maps en arrays triés
    const ordersByDay: OrdersByDay[] = Array.from(ordersByDayMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const ordersByWeek: OrdersByWeek[] = Array.from(ordersByWeekMap.entries())
      .map(([week, stats]) => ({ week, ...stats }))
      .sort((a, b) => a.week.localeCompare(b.week));

    const topItems: TopItem[] = Array.from(itemsMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    const driverPerformance: DriverPerformance[] = Array.from(driversMap.entries())
      .map(([driverId, stats]) => ({
        driverId,
        ...stats,
        averageTip: stats.ordersCompleted > 0 ? stats.totalTips / stats.ordersCompleted : 0,
      }))
      .sort((a, b) => b.ordersCompleted - a.ordersCompleted);

    const hourlyStats: HourlyStats[] = Array.from(hourlyMap.entries())
      .map(([hour, stats]) => ({ hour, ...stats }))
      .sort((a, b) => a.hour - b.hour);

    const totalOrders = orders.length;
    const cancelledFailed: CancelledFailedStats = {
      cancelled,
      failed,
      total: cancelled + failed,
      cancellationRate: totalOrders > 0 ? ((cancelled + failed) / totalOrders) * 100 : 0,
    };

    return {
      orders,
      revenue,
      ordersByDay,
      ordersByWeek,
      topItems,
      cancelledFailed,
      driverPerformance,
      hourlyStats,
    };
  }, [orders]);

  return {
    analytics,
    loading,
    refetch: fetchOrders,
  };
}


import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { KitchenOrder } from '../../../types/orders';
import { ORDER_DETAIL_SELECT, mapOrderRowToKitchenOrder } from '../../../utils/orderHelpers';
import { STATUS_SECTIONS } from '../constants';
import type { DateFilterId, FulfillmentFilterId } from '../types';

export function useOrders(restaurantId: string) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterId>('today');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilterId>('all');

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_DETAIL_SELECT)
        .eq('restaurant_id', restaurantId)
        .in('status', [
          'received',
          'preparing',
          'ready',
          'assigned',
          'enroute',
          'completed',
          'cancelled',
          'failed',
        ])
        .order('placed_at', { ascending: false });

      if (error) {
        console.warn(error);
        return;
      }

      setOrders(data?.map(mapOrderRowToKitchenOrder) ?? []);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchOrders]);

  const filteredByControls = useMemo(() => {
    const now = new Date();

    let start: Date | null = null;
    let end: Date | null = null;

    if (dateFilter === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else if (dateFilter === 'yesterday') {
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      start = new Date(end);
      start.setDate(start.getDate() - 1);
    } else if (dateFilter === 'week') {
      end = now;
      start = new Date(now);
      start.setDate(start.getDate() - 7);
    } else if (dateFilter === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    return orders.filter((order) => {
      const placed = new Date(order.placedAt);
      const matchesDate =
        !start || !end || (placed.getTime() >= start.getTime() && placed.getTime() < end.getTime());

      const matchesFulfillment =
        fulfillmentFilter === 'all' ? true : order.fulfillment === fulfillmentFilter;

      const normalizedOrderNumber = order.orderNumber ? String(order.orderNumber) : '';
      const matchesSearch = search
        ? normalizedOrderNumber.toLowerCase().includes(search.toLowerCase())
        : true;

      return matchesDate && matchesFulfillment && matchesSearch;
    });
  }, [orders, dateFilter, fulfillmentFilter, search]);

  const grouped = useMemo(() => {
    return STATUS_SECTIONS.map((section) => {
      const sectionOrders = filteredByControls.filter((order) => {
        if (section.id === 'cancelled_failed') {
          return order.status === 'cancelled' || order.status === 'failed';
        }
        return order.status === section.id;
      });

      return { ...section, orders: sectionOrders };
    });
  }, [filteredByControls]);

  return {
    orders,
    loading,
    search,
    setSearch,
    dateFilter,
    setDateFilter,
    fulfillmentFilter,
    setFulfillmentFilter,
    grouped,
    refetch: fetchOrders,
  };
}


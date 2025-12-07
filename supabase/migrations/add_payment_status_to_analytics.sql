-- Ajouter le statut du paiement à la fonction get_orders_with_toronto_time
-- pour pouvoir exclure les commandes remboursées des analytics

CREATE OR REPLACE FUNCTION get_orders_with_toronto_time(
  p_restaurant_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'status', o.status::text,
      'fulfillment', o.fulfillment::text,
      'placed_at', o.placed_at,
      'placed_at_toronto', jsonb_build_object(
        'year', EXTRACT(YEAR FROM o.placed_at AT TIME ZONE 'America/Toronto')::int,
        'month', EXTRACT(MONTH FROM o.placed_at AT TIME ZONE 'America/Toronto')::int,
        'day', EXTRACT(DAY FROM o.placed_at AT TIME ZONE 'America/Toronto')::int,
        'hour', EXTRACT(HOUR FROM o.placed_at AT TIME ZONE 'America/Toronto')::int,
        'minute', EXTRACT(MINUTE FROM o.placed_at AT TIME ZONE 'America/Toronto')::int,
        'second', EXTRACT(SECOND FROM o.placed_at AT TIME ZONE 'America/Toronto')::int
      ),
      'completed_at', o.completed_at,
      'cancelled_at', o.cancelled_at,
      'subtotal', o.subtotal,
      'delivery_fee', o.delivery_fee,
      'tip_amount', o.tip_amount,
      'taxes', o.taxes,
      'total', o.total,
      'driver_id', o.driver_id,
      'driver_name', driver.username,
      'cook_id', o.cook_id,
      'cook_name', cook.username,
      'payment_status', (
        SELECT p.status::text
        FROM payments p
        WHERE p.order_id = o.id
        ORDER BY p.created_at DESC
        LIMIT 1
      ),
      'order_items', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'name', oi.name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'menu_item_id', oi.menu_item_id
          )
        )
        FROM order_items oi
        WHERE oi.order_id = o.id
      )
    )
    ORDER BY o.placed_at DESC
  ) INTO result
  FROM orders o
  LEFT JOIN staff_users driver ON o.driver_id = driver.id
  LEFT JOIN staff_users cook ON o.cook_id = cook.id
  WHERE o.restaurant_id = p_restaurant_id
    -- Filtrer sur placed_at_toronto pour avoir les bonnes dates en heure Toronto
    -- p_start_date et p_end_date sont en UTC (timestamptz), on les convertit en heure Toronto pour comparer
    -- On compare les dates (sans heure) pour avoir toutes les commandes du jour
    -- On utilise >= pour inclure le début de la journée et <= pour inclure la fin
    AND (o.placed_at AT TIME ZONE 'America/Toronto')::date >= (p_start_date AT TIME ZONE 'America/Toronto')::date
    AND (o.placed_at AT TIME ZONE 'America/Toronto')::date <= (p_end_date AT TIME ZONE 'America/Toronto')::date;
  
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;


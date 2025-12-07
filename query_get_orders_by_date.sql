-- Requête pour récupérer les commandes d'une journée précise
-- Remplacez 'YYYY-MM-DD' par la date souhaitée (ex: '2024-12-01')
-- Remplacez 'restaurant-uuid' par l'UUID du restaurant

-- Option 1: En utilisant le fuseau horaire America/Toronto
SELECT 
  id,
  order_number,
  status,
  fulfillment,
  placed_at,
  subtotal,
  delivery_fee,
  tip_amount,
  taxes,
  total,
  customer_id,
  driver_id,
  cook_id
FROM orders
WHERE restaurant_id = 'restaurant-uuid'
  AND placed_at >= ('YYYY-MM-DD'::date AT TIME ZONE 'America/Toronto')::timestamp
  AND placed_at < (('YYYY-MM-DD'::date + INTERVAL '1 day') AT TIME ZONE 'America/Toronto')::timestamp
ORDER BY placed_at DESC;

-- Option 2: Version simplifiée (si les dates sont déjà en UTC dans la DB)
-- Pour le 1er décembre 2024 par exemple:
SELECT 
  id,
  order_number,
  status,
  fulfillment,
  placed_at,
  subtotal,
  delivery_fee,
  tip_amount,
  taxes,
  total,
  customer_id,
  driver_id,
  cook_id
FROM orders
WHERE restaurant_id = 'restaurant-uuid'
  AND placed_at >= '2024-12-01 00:00:00-05:00'::timestamptz  -- Début de journée en EST (UTC-5)
  AND placed_at < '2024-12-02 00:00:00-05:00'::timestamptz   -- Fin de journée en EST
ORDER BY placed_at DESC;

-- Option 3: Version avec conversion de fuseau horaire explicite
SELECT 
  id,
  order_number,
  status,
  fulfillment,
  placed_at,
  placed_at AT TIME ZONE 'America/Toronto' as placed_at_toronto,
  subtotal,
  delivery_fee,
  tip_amount,
  taxes,
  total,
  customer_id,
  driver_id,
  cook_id
FROM orders
WHERE restaurant_id = 'restaurant-uuid'
  AND (placed_at AT TIME ZONE 'America/Toronto')::date = 'YYYY-MM-DD'::date
ORDER BY placed_at DESC;


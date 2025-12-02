export const ORDER_DETAIL_SELECT = `
  id,
  order_number,
  status,
  fulfillment,
  placed_at,
  scheduled_at,
  pickup_name,
  pickup_phone,
  delivery_name,
  delivery_address,
  drop_option,
  apartment_suite,
  notes,
  tip_amount,
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


export const ORDER_DETAIL_SELECT = `
  id,
  order_number,
  status,
  fulfillment,
  placed_at,
  scheduled_at,
  pickup_name,
  pickup_phone,
  delivery_address,
  customers:customer_id (
    first_name,
    phone,
    email
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


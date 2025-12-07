-- Add delivery_name column to orders table
-- This column stores the customer name for delivery orders, similar to pickup_name for pickup orders

ALTER TABLE public.orders
ADD COLUMN delivery_name text;

-- Add comment to document the column
COMMENT ON COLUMN public.orders.delivery_name IS 'Customer name for delivery orders, stored separately from delivery_address JSONB for easier querying and to avoid issues with multiple customers sharing the same phone number';


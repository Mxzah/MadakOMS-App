-- Migration: Remove the old min_order_amount column
-- This column has been replaced by min_order_amount_pickup and min_order_amount_delivery
-- 
-- IMPORTANT: Make sure no other parts of your system (web app, API, etc.) 
-- are still using min_order_amount before running this migration

ALTER TABLE restaurant_settings
DROP COLUMN IF EXISTS min_order_amount;


-- Add new columns to vouchers table to store historical paper ticket data
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS purchase_date timestamp with time zone;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;

-- Update RLS policies if necessary (existing ones should cover new columns automatically as they apply to the row)

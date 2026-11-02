ALTER TABLE public.crew_invoice_settings ADD COLUMN IF NOT EXISTS vat_registered boolean NOT NULL DEFAULT false;
ALTER TABLE public.crew_invoice_settings ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE public.crew_invoice_settings ADD COLUMN IF NOT EXISTS tax_country text NOT NULL DEFAULT 'ZA';
ALTER TABLE public.crew_invoice_settings ADD COLUMN IF NOT EXISTS customer_tax_number text NOT NULL DEFAULT '';
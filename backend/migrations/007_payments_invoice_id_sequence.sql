-- Migration 007: auto-generate payments.invoice_id via sequence.
--
-- payments.invoice_id is BIGINT NOT NULL with no default. The app INSERTs
-- without specifying invoice_id, which throws NotNullViolation on every
-- payment creation (POST /api/payments/robokassa/create). Historical rows
-- 1..48 were filled by the old Supabase stack; after the FastAPI cutover
-- nothing was generating them.
--
-- Fix: create a sequence, attach as DEFAULT, seed past MAX, add UNIQUE.
-- Idempotent.

DO $$
DECLARE
    seq_max bigint;
BEGIN
    CREATE SEQUENCE IF NOT EXISTS payments_invoice_id_seq;

    SELECT COALESCE(MAX(invoice_id), 0) FROM payments INTO seq_max;
    PERFORM setval('payments_invoice_id_seq', seq_max + 1, false);

    ALTER TABLE payments
        ALTER COLUMN invoice_id SET DEFAULT nextval('payments_invoice_id_seq');
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payments_invoice_id_unique'
    ) THEN
        ALTER TABLE payments ADD CONSTRAINT payments_invoice_id_unique UNIQUE (invoice_id);
    END IF;
END $$;

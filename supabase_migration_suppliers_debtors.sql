-- ============================================================
-- Brushwell POS — Suppliers & Debtors Module Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- ─── SUPPLIERS ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  contact_person  TEXT DEFAULT '',
  phone           TEXT DEFAULT '',
  email           TEXT DEFAULT '',
  address         TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  total_credit    NUMERIC(12,2) DEFAULT 0,
  total_paid      NUMERIC(12,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── SUPPLIER TRANSACTIONS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id        UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  type               TEXT NOT NULL CHECK (type IN ('credit','payment')),
  amount             NUMERIC(12,2) NOT NULL DEFAULT 0,
  description        TEXT DEFAULT '',
  reference          TEXT DEFAULT '',
  invoice_image_url  TEXT DEFAULT '',
  invoice_image_data TEXT DEFAULT '',
  created_by         TEXT DEFAULT 'Staff',
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_txn_supplier_id ON public.supplier_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_txn_created_at  ON public.supplier_transactions(created_at DESC);

-- ─── DEBTORS ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.debtors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  address       TEXT DEFAULT '',
  school        TEXT DEFAULT '',
  notes         TEXT DEFAULT '',
  total_debit   NUMERIC(12,2) DEFAULT 0,
  total_paid    NUMERIC(12,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── DEBTOR TRANSACTIONS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.debtor_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id          UUID NOT NULL REFERENCES public.debtors(id) ON DELETE CASCADE,
  type               TEXT NOT NULL CHECK (type IN ('debit','payment')),
  amount             NUMERIC(12,2) NOT NULL DEFAULT 0,
  description        TEXT DEFAULT '',
  reference          TEXT DEFAULT '',
  invoice_image_url  TEXT DEFAULT '',
  invoice_image_data TEXT DEFAULT '',
  created_by         TEXT DEFAULT 'Staff',
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debtor_txn_debtor_id   ON public.debtor_transactions(debtor_id);
CREATE INDEX IF NOT EXISTS idx_debtor_txn_created_at  ON public.debtor_transactions(created_at DESC);

-- ─── RLS POLICIES ────────────────────────────────────────────────────────────
ALTER TABLE public.suppliers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debtors               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debtor_transactions   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all" ON public.suppliers;
CREATE POLICY "Allow all" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all" ON public.supplier_transactions;
CREATE POLICY "Allow all" ON public.supplier_transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all" ON public.debtors;
CREATE POLICY "Allow all" ON public.debtors FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all" ON public.debtor_transactions;
CREATE POLICY "Allow all" ON public.debtor_transactions FOR ALL USING (true) WITH CHECK (true);

-- ─── ROLE PRIVILEGES (Fixes: permission denied for table) ─────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON TABLE public.suppliers             TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.supplier_transactions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.debtors               TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.debtor_transactions   TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

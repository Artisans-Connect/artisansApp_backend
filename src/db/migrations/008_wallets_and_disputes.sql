-- Migration 008: Wallets, Escrow Ledger, Disputes, and Payout Requests

CREATE TABLE IF NOT EXISTS user_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    held_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (held_balance >= 0),
    currency TEXT NOT NULL DEFAULT 'GHS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES user_wallets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('deposit', 'escrow_lock', 'escrow_release', 'refund', 'payout', 'cancellation_fee', 'split_settlement')),
    amount NUMERIC(12, 2) NOT NULL,
    reference TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    raised_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    against_user UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    evidence_photos TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'rejected')),
    resolution_type TEXT CHECK (resolution_type IN ('full_refund', 'full_payout', 'split')),
    client_amount NUMERIC(12, 2) DEFAULT 0.00,
    worker_amount NUMERIC(12, 2) DEFAULT 0.00,
    resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    channel TEXT NOT NULL DEFAULT 'momo' CHECK (channel IN ('momo', 'bank')),
    account_number TEXT NOT NULL,
    account_name TEXT NOT NULL,
    bank_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed')),
    paystack_transfer_code TEXT,
    reference TEXT UNIQUE NOT NULL,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_wallets_user ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_job ON wallet_transactions(job_id);
CREATE INDEX IF NOT EXISTS idx_job_disputes_job ON job_disputes(job_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_worker ON payout_requests(worker_id);

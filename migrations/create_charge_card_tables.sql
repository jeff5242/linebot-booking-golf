-- =============================================
-- Migration: 收費卡與桿弟管理表格
-- =============================================

-- 1. 桿弟名冊
CREATE TABLE IF NOT EXISTS public.caddies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    caddy_number TEXT UNIQUE NOT NULL,
    phone TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caddies_status ON caddies(status);

ALTER TABLE caddies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all caddies" ON caddies FOR ALL USING (true);

COMMENT ON TABLE caddies IS '桿弟名冊';
COMMENT ON COLUMN caddies.caddy_number IS '桿弟編號，例如 01, 02, 08';
COMMENT ON COLUMN caddies.status IS 'active=在職, inactive=停用';

-- 2. 收費卡
CREATE TABLE IF NOT EXISTS public.charge_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id) NOT NULL,
    caddy_id UUID REFERENCES caddies(id),
    caddy_ratio TEXT NOT NULL CHECK (caddy_ratio IN ('1:1', '1:2', '1:3', '1:4')),
    course TEXT DEFAULT 'A -> B',
    fees_breakdown JSONB NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    status TEXT DEFAULT 'created' CHECK (status IN ('created', 'printed', 'paid', 'voided')),
    notification_sent BOOLEAN DEFAULT false,
    notification_sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_charge_cards_booking ON charge_cards(booking_id);
CREATE INDEX IF NOT EXISTS idx_charge_cards_status ON charge_cards(status);

ALTER TABLE charge_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all charge_cards" ON charge_cards FOR ALL USING (true);

COMMENT ON TABLE charge_cards IS '收費卡記錄';
COMMENT ON COLUMN charge_cards.fees_breakdown IS '費用明細快照 JSON: {greenFee, cleaningFee, cartFee, caddyFee, subtotal, entertainmentTax, perPlayer:[...]}';
COMMENT ON COLUMN charge_cards.caddy_ratio IS '桿弟配比: 1:1, 1:2, 1:3, 1:4';
COMMENT ON COLUMN charge_cards.status IS 'created=已產卡, printed=已列印, paid=已付款, voided=作廢';

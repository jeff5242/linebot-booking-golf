-- ============================================
-- 生產環境 Migration - 費率管理系統（安全版）
-- 執行前請確認：此 SQL 將在生產環境 Supabase 執行
-- ============================================

-- 1. 費率配置主表（版本控制）
CREATE TABLE IF NOT EXISTS rate_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_number INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    green_fees JSONB NOT NULL,
    caddy_fees JSONB NOT NULL,
    base_fees JSONB NOT NULL,
    tax_config JSONB NOT NULL DEFAULT '{"entertainment_tax": 0.05}',
    effective_date TIMESTAMP,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    submitted_at TIMESTAMP,
    submitted_by UUID,
    approved_at TIMESTAMP,
    approved_by UUID,
    rejection_reason TEXT,
    UNIQUE(version_number)
);

-- 2. 費率變更請求表
CREATE TABLE IF NOT EXISTS rate_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_config_id UUID REFERENCES rate_configs(id),
    request_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    changes_summary JSONB,
    requested_by UUID,
    requested_at TIMESTAMP DEFAULT NOW(),
    reviewed_by UUID,
    reviewed_at TIMESTAMP,
    review_comment TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 費率審計日誌
CREATE TABLE IF NOT EXISTS rate_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_config_id UUID REFERENCES rate_configs(id),
    action VARCHAR(50) NOT NULL,
    performed_by UUID,
    performed_at TIMESTAMP DEFAULT NOW(),
    old_data JSONB,
    new_data JSONB,
    notes TEXT
);

-- 4. 會員等級定義表
CREATE TABLE IF NOT EXISTS membership_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_code VARCHAR(20) UNIQUE NOT NULL,
    tier_name VARCHAR(50) NOT NULL,
    display_order INTEGER NOT NULL,
    onboarding_config JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. 會員禮遇發放記錄
CREATE TABLE IF NOT EXISTS membership_benefits_issued (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    tier_code VARCHAR(20) REFERENCES membership_tiers(tier_code),
    benefit_type VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    voucher_code VARCHAR(50),
    issued_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 初始資料
-- ============================================

-- 插入會員等級
INSERT INTO membership_tiers (tier_code, tier_name, display_order, onboarding_config) VALUES
('platinum', '白金會員', 1, '{"membership_fee": 6600, "vouchers": {"merchandise": 3000, "discount": 3600}}'),
('gold', '金卡會員', 2, '{"membership_fee": 2800, "vouchers": {"merchandise": 1400, "discount": 1400}}'),
('team_friend', '球隊/友人', 3, '{"membership_fee": 0, "vouchers": {}}'),
('guest', '一般來賓', 4, '{"membership_fee": 0, "vouchers": {}}')
ON CONFLICT (tier_code) DO NOTHING;

-- 插入預設費率配置（Version 1）
INSERT INTO rate_configs (
    version_number,
    status,
    green_fees,
    caddy_fees,
    base_fees,
    tax_config,
    notes
) VALUES (
    1,
    'active',
    '{"platinum": {"9": {"weekday": 800, "holiday": 800}, "18": {"weekday": 1600, "holiday": 1600}}, "gold": {"9": {"weekday": 900, "holiday": 1000}, "18": {"weekday": 1800, "holiday": 2000}}, "team_friend": {"9": {"weekday": 1000, "holiday": 1100}, "18": {"weekday": 2000, "holiday": 2200}}, "guest": {"9": {"weekday": 1100, "holiday": 1200}, "18": {"weekday": 2200, "holiday": 2400}}}',
    '{"1:1": {"9": 350, "18": 700}, "1:2": {"9": 220, "18": 440}, "1:3": {"9": 165, "18": 330}, "1:4": {"9": 165, "18": 330}}',
    '{"cleaning": {"9": 100, "18": 200}, "cart_per_person": {"9": 100, "18": 200}}',
    '{"entertainment_tax": 0.05}',
    '系統預設費率（2026年版）'
)
ON CONFLICT (version_number) DO NOTHING;

-- ============================================
-- 索引優化
-- ============================================
CREATE INDEX IF NOT EXISTS idx_rate_configs_status ON rate_configs(status);
CREATE INDEX IF NOT EXISTS idx_rate_configs_version ON rate_configs(version_number DESC);
CREATE INDEX IF NOT EXISTS idx_rate_change_requests_status ON rate_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_rate_audit_log_config ON rate_audit_log(rate_config_id, performed_at DESC);

-- ============================================
-- RLS 政策（僅創建，不刪除現有政策）
-- ============================================
ALTER TABLE rate_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_benefits_issued ENABLE ROW LEVEL SECURITY;

-- 允許所有用戶讀取生效中的費率（如果政策不存在則創建）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'rate_configs'
        AND policyname = 'Allow all to read active rates'
    ) THEN
        CREATE POLICY "Allow all to read active rates"
        ON rate_configs FOR SELECT
        USING (status = 'active');
    END IF;
END $$;

-- 允許所有用戶讀取會員等級
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'membership_tiers'
        AND policyname = 'Allow all to read tiers'
    ) THEN
        CREATE POLICY "Allow all to read tiers"
        ON membership_tiers FOR SELECT
        USING (true);
    END IF;
END $$;

-- ✅ Migration 完成
-- 現在可以使用費率管理功能了！

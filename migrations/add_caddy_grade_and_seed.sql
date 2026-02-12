-- =============================================
-- Migration: 桿弟名冊 - 新增級別與備註欄位 + 匯入初始資料
-- =============================================

-- 1. 新增欄位
ALTER TABLE caddies ADD COLUMN IF NOT EXISTS grade TEXT CHECK (grade IN ('A', 'B', 'C'));
ALTER TABLE caddies ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN caddies.grade IS '桿弟級別: A, B, C';
COMMENT ON COLUMN caddies.notes IS '備註（供後續擴充使用）';

-- 2. 匯入桿弟資料（使用 ON CONFLICT 避免重複匯入）
INSERT INTO caddies (caddy_number, name, grade, status) VALUES
    ('7',  '林惠真', 'A', 'active'),
    ('8',  '蔡強生', 'C', 'active'),
    ('15', '藍銘椒', 'A', 'active'),
    ('22', '蔣梓玢', 'B', 'active'),
    ('24', '卓振平', 'B', 'active'),
    ('25', '楊玉蘭', 'A', 'active'),
    ('26', '張碧英', 'A', 'active'),
    ('27', '林愛珍', 'A', 'active'),
    ('28', '劉苑冬', 'A', 'active'),
    ('29', '吳秀景', 'A', 'active'),
    ('30', '王秀娟', 'A', 'active'),
    ('31', '鄭金春', 'A', 'active'),
    ('32', '黃酉曲', 'A', 'active'),
    ('35', '洪秀換', 'A', 'active'),
    ('36', '林芳妤', 'A', 'active'),
    ('37', '王秀霞', 'A', 'active'),
    ('38', '陳勇志', 'B', 'active'),
    ('39', '何麗貞', 'A', 'active')
ON CONFLICT (caddy_number) DO UPDATE SET
    name = EXCLUDED.name,
    grade = EXCLUDED.grade,
    updated_at = NOW();

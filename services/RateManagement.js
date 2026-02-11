const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

/**
 * ============================================
 * 核心計費邏輯
 * ============================================
 */

/**
 * 計算總費用
 * @param {Object} params - 計費參數
 * @param {string} params.tier - 會員等級 (platinum, gold, team_friend, guest)
 * @param {number} params.holes - 球洞數 (9 or 18)
 * @param {boolean} params.isHoliday - 是否假日
 * @param {string} params.caddyRatio - 桿弟配比 (1:1, 1:2, 1:3, 1:4)
 * @param {number} params.numPlayers - 人數（用於計算球車費）
 * @param {Object} rateConfig - 費率配置物件（可選，不提供則從DB讀取）
 * @returns {Promise<Object>} 費用明細
 */
async function calculateTotalFee(params, rateConfig = null) {
    const { tier, holes, isHoliday, caddyRatio, numPlayers = 1 } = params;

    // 如果沒有提供費率配置，從資料庫讀取當前生效的費率
    if (!rateConfig) {
        rateConfig = await getActiveRateConfig();
    }

    // 1. 果嶺費
    const greenFee = rateConfig.green_fees[tier][holes][isHoliday ? 'holiday' : 'weekday'];

    // 2. 清潔費
    const cleaningFee = rateConfig.base_fees.cleaning[holes];

    // 3. 球車費（按人頭計算）
    const cartFee = rateConfig.base_fees.cart_per_person[holes] * numPlayers;

    // 4. 桿弟費
    const caddyFee = rateConfig.caddy_fees[caddyRatio][holes];

    // 5. 小計
    const subtotal = greenFee + cleaningFee + cartFee + caddyFee;

    // 6. 娛樂稅 (5%)
    const entertainmentTax = Math.round(subtotal * rateConfig.tax_config.entertainment_tax);

    // 7. 總計
    const totalAmount = subtotal + entertainmentTax;

    return {
        breakdown: {
            greenFee,
            cleaningFee,
            cartFee,
            caddyFee,
            subtotal,
            entertainmentTax,
        },
        totalAmount,
        metadata: {
            tier,
            holes,
            isHoliday,
            caddyRatio,
            numPlayers,
            taxRate: rateConfig.tax_config.entertainment_tax
        }
    };
}

/**
 * ============================================
 * 費率配置管理
 * ============================================
 */

/**
 * 取得當前生效的費率配置
 */
async function getActiveRateConfig() {
    const { data, error } = await supabase
        .from('rate_configs')
        .select('*')
        .eq('status', 'active')
        .order('version_number', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) {
        throw new Error('無法讀取生效中的費率配置');
    }

    return data;
}

/**
 * 取得所有費率配置（含歷史版本）
 */
async function getAllRateConfigs(filters = {}) {
    let query = supabase
        .from('rate_configs')
        .select('*, created_by_user:users!created_by(display_name), approved_by_user:users!approved_by(display_name)')
        .order('version_number', { ascending: false });

    if (filters.status) {
        query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`讀取費率配置失敗: ${error.message}`);
    }

    return data;
}

/**
 * 創建新的費率配置（草稿）
 */
async function createRateConfig(rateData, createdBy) {
    // 取得下一個版本號
    const { data: latestVersion } = await supabase
        .from('rate_configs')
        .select('version_number')
        .order('version_number', { ascending: false })
        .limit(1)
        .single();

    const nextVersion = (latestVersion?.version_number || 0) + 1;

    // 驗證白金會員平假日價格一致
    const platinumWeekday9 = rateData.green_fees.platinum[9].weekday;
    const platinumHoliday9 = rateData.green_fees.platinum[9].holiday;
    const platinumWeekday18 = rateData.green_fees.platinum[18].weekday;
    const platinumHoliday18 = rateData.green_fees.platinum[18].holiday;

    if (platinumWeekday9 !== platinumHoliday9 || platinumWeekday18 !== platinumHoliday18) {
        throw new Error('白金會員的平日與假日價格必須一致');
    }

    const { data, error } = await supabase
        .from('rate_configs')
        .insert({
            version_number: nextVersion,
            status: 'draft',
            green_fees: rateData.green_fees,
            caddy_fees: rateData.caddy_fees,
            base_fees: rateData.base_fees,
            tax_config: rateData.tax_config || { entertainment_tax: 0.05 },
            notes: rateData.notes || '',
            created_by: createdBy
        })
        .select()
        .single();

    if (error) {
        throw new Error(`創建費率配置失敗: ${error.message}`);
    }

    // 記錄審計日誌
    await logAudit(data.id, 'created', createdBy, null, data);

    return data;
}

/**
 * 更新費率配置（僅限草稿狀態）
 */
async function updateRateConfig(configId, rateData, updatedBy) {
    // 檢查狀態
    const { data: config } = await supabase
        .from('rate_configs')
        .select('*')
        .eq('id', configId)
        .single();

    if (!config) {
        throw new Error('費率配置不存在');
    }

    if (config.status !== 'draft') {
        throw new Error('只能修改草稿狀態的費率配置');
    }

    // 驗證白金會員價格一致性
    const platinumWeekday9 = rateData.green_fees.platinum[9].weekday;
    const platinumHoliday9 = rateData.green_fees.platinum[9].holiday;
    const platinumWeekday18 = rateData.green_fees.platinum[18].weekday;
    const platinumHoliday18 = rateData.green_fees.platinum[18].holiday;

    if (platinumWeekday9 !== platinumHoliday9 || platinumWeekday18 !== platinumHoliday18) {
        throw new Error('白金會員的平日與假日價格必須一致');
    }

    const { data, error } = await supabase
        .from('rate_configs')
        .update({
            green_fees: rateData.green_fees,
            caddy_fees: rateData.caddy_fees,
            base_fees: rateData.base_fees,
            tax_config: rateData.tax_config,
            notes: rateData.notes,
            updated_at: new Date()
        })
        .eq('id', configId)
        .select()
        .single();

    if (error) {
        throw new Error(`更新費率配置失敗: ${error.message}`);
    }

    // 記錄審計日誌
    await logAudit(configId, 'updated', updatedBy, config, data);

    return data;
}

/**
 * ============================================
 * 審核流程
 * ============================================
 */

/**
 * 提交費率配置審核
 */
async function submitForApproval(configId, submittedBy, changesSummary = {}) {
    // 更新狀態為待審核
    const { data, error } = await supabase
        .from('rate_configs')
        .update({
            status: 'pending_approval',
            submitted_at: new Date(),
            submitted_by: submittedBy
        })
        .eq('id', configId)
        .eq('status', 'draft')
        .select()
        .single();

    if (error) {
        throw new Error(`提交審核失敗: ${error.message}`);
    }

    // 創建審核請求
    await supabase.from('rate_change_requests').insert({
        rate_config_id: configId,
        request_type: 'create',
        status: 'pending',
        changes_summary: changesSummary,
        requested_by: submittedBy
    });

    // 記錄審計日誌
    await logAudit(configId, 'submitted', submittedBy, null, data);

    return data;
}

/**
 * 批准費率配置
 */
async function approveRateConfig(configId, approvedBy, effectiveDate = null) {
    const { data, error } = await supabase
        .from('rate_configs')
        .update({
            status: 'approved',
            approved_at: new Date(),
            approved_by: approvedBy,
            effective_date: effectiveDate || new Date()
        })
        .eq('id', configId)
        .eq('status', 'pending_approval')
        .select()
        .single();

    if (error) {
        throw new Error(`批准失敗: ${error.message}`);
    }

    // 更新審核請求狀態
    await supabase
        .from('rate_change_requests')
        .update({
            status: 'approved',
            reviewed_by: approvedBy,
            reviewed_at: new Date()
        })
        .eq('rate_config_id', configId)
        .eq('status', 'pending');

    // 記錄審計日誌
    await logAudit(configId, 'approved', approvedBy, null, data);

    return data;
}

/**
 * 拒絕費率配置
 */
async function rejectRateConfig(configId, reviewedBy, rejectionReason) {
    const { data, error } = await supabase
        .from('rate_configs')
        .update({
            status: 'draft',
            rejection_reason: rejectionReason
        })
        .eq('id', configId)
        .eq('status', 'pending_approval')
        .select()
        .single();

    if (error) {
        throw new Error(`拒絕失敗: ${error.message}`);
    }

    // 更新審核請求狀態
    await supabase
        .from('rate_change_requests')
        .update({
            status: 'rejected',
            reviewed_by: reviewedBy,
            reviewed_at: new Date(),
            review_comment: rejectionReason
        })
        .eq('rate_config_id', configId)
        .eq('status', 'pending');

    // 記錄審計日誌
    await logAudit(configId, 'rejected', reviewedBy, null, data, rejectionReason);

    return data;
}

/**
 * 啟用費率配置
 */
async function activateRateConfig(configId, activatedBy) {
    // 將當前 active 的配置設為 archived
    await supabase
        .from('rate_configs')
        .update({ status: 'archived' })
        .eq('status', 'active');

    // 啟用新配置
    const { data, error } = await supabase
        .from('rate_configs')
        .update({
            status: 'active',
            effective_date: new Date()
        })
        .eq('id', configId)
        .eq('status', 'approved')
        .select()
        .single();

    if (error) {
        throw new Error(`啟用失敗: ${error.message}`);
    }

    // 記錄審計日誌
    await logAudit(configId, 'activated', activatedBy, null, data);

    return data;
}

/**
 * ============================================
 * 審計日誌
 * ============================================
 */
async function logAudit(configId, action, performedBy, oldData, newData, notes = '') {
    await supabase.from('rate_audit_log').insert({
        rate_config_id: configId,
        action,
        performed_by: performedBy,
        old_data: oldData,
        new_data: newData,
        notes
    });
}

/**
 * 取得審計日誌
 */
async function getAuditLog(configId) {
    const { data, error } = await supabase
        .from('rate_audit_log')
        .select('*, performed_by_user:users!performed_by(display_name)')
        .eq('rate_config_id', configId)
        .order('performed_at', { ascending: false });

    if (error) {
        throw new Error(`讀取審計日誌失敗: ${error.message}`);
    }

    return data;
}

/**
 * ============================================
 * 入會禮遇自動發放
 * ============================================
 */

/**
 * 發放入會禮遇
 */
async function issueMembershipBenefits(userId, tierCode) {
    // 取得會員等級配置
    const { data: tier } = await supabase
        .from('membership_tiers')
        .select('*')
        .eq('tier_code', tierCode)
        .single();

    if (!tier || !tier.onboarding_config.vouchers) {
        return { success: false, message: '該等級無入會禮遇' };
    }

    const benefits = [];
    const vouchers = tier.onboarding_config.vouchers;

    // 發放商品券
    if (vouchers.merchandise > 0) {
        const { data: merchandiseVoucher } = await supabase
            .from('membership_benefits_issued')
            .insert({
                user_id: userId,
                tier_code: tierCode,
                benefit_type: 'merchandise_voucher',
                amount: vouchers.merchandise,
                voucher_code: `MERCH-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
                expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1年有效期
            })
            .select()
            .single();

        benefits.push(merchandiseVoucher);
    }

    // 發放折抵券
    if (vouchers.discount > 0) {
        const { data: discountVoucher } = await supabase
            .from('membership_benefits_issued')
            .insert({
                user_id: userId,
                tier_code: tierCode,
                benefit_type: 'discount_voucher',
                amount: vouchers.discount,
                voucher_code: `DISC-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
                expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            })
            .select()
            .single();

        benefits.push(discountVoucher);
    }

    return {
        success: true,
        benefits,
        message: `已發放 ${tierCode} 入會禮遇`
    };
}

module.exports = {
    // 計費邏輯
    calculateTotalFee,

    // 費率配置管理
    getActiveRateConfig,
    getAllRateConfigs,
    createRateConfig,
    updateRateConfig,

    // 審核流程
    submitForApproval,
    approveRateConfig,
    rejectRateConfig,
    activateRateConfig,

    // 審計日誌
    getAuditLog,

    // 入會禮遇
    issueMembershipBenefits
};

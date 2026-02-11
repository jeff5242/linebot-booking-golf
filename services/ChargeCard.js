const { createClient } = require('@supabase/supabase-js');
const { calculateTotalFee, getActiveRateConfig } = require('./RateManagement');
const { sendPushMessage, buildChargeCardMessage } = require('./LineNotification');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

/**
 * 會員身分 → 費率等級映射
 */
function golferTypeToTier(golferType) {
    const mapping = {
        '白金會員': 'platinum',
        '金卡會員': 'gold',
        '社區會員': 'gold',
        'VIP-A': 'gold',
        'VIP-B': 'gold',
        '團友': 'team_friend',
        '來賓': 'guest',
    };
    return mapping[golferType] || 'guest';
}

/**
 * 判斷是否為假日
 */
function isHoliday(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDay();
    return day === 0 || day === 6; // 週六日為假日
}

/**
 * 產生收費卡
 * @param {string} bookingId - 預約 ID
 * @param {Object} params
 * @param {string} params.caddyId - 桿弟 ID
 * @param {string} params.caddyRatio - 桿弟配比 (1:1 ~ 1:4)
 * @param {string} params.course - 球道 (e.g. 'A -> B')
 * @param {Object} params.tierOverrides - 球員等級覆寫 {playerIndex: tier}
 */
async function generateChargeCard(bookingId, { caddyId, caddyRatio, course, tierOverrides = {} }) {
    // 1. 讀取預約資料 + 使用者
    const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('*, users(id, display_name, phone, golfer_type, member_no, line_user_id)')
        .eq('id', bookingId)
        .single();

    if (bookingError || !booking) {
        throw new Error('找不到預約資料');
    }

    if (booking.status !== 'checked_in') {
        throw new Error('該預約尚未報到，無法產生收費卡');
    }

    // 2. 檢查是否已有收費卡
    const { data: existingCard } = await supabase
        .from('charge_cards')
        .select('id')
        .eq('booking_id', bookingId)
        .neq('status', 'voided')
        .single();

    if (existingCard) {
        throw new Error('該預約已有收費卡，請先作廢再重新產卡');
    }

    // 3. 讀取桿弟
    let caddy = null;
    if (caddyId) {
        const { data: caddyData } = await supabase
            .from('caddies')
            .select('*')
            .eq('id', caddyId)
            .single();
        caddy = caddyData;
    }

    // 4. 讀取費率配置
    const rateConfig = await getActiveRateConfig();
    const holiday = isHoliday(booking.date);

    // 5. 計算每位球員費用
    const players = booking.players_info || [];
    const playersCount = booking.players_count || players.length || 1;
    const mainUserTier = golferTypeToTier(booking.users?.golfer_type);

    const perPlayerFees = [];
    let totalGreenFee = 0;
    let totalCleaningFee = 0;
    let totalCartFee = 0;

    for (let i = 0; i < playersCount; i++) {
        const playerTier = tierOverrides[i] || mainUserTier;
        const result = await calculateTotalFee({
            tier: playerTier,
            holes: booking.holes,
            isHoliday: holiday,
            caddyRatio: caddyRatio,
            numPlayers: 1
        }, rateConfig);

        perPlayerFees.push({
            index: i,
            name: players[i]?.name || `球員 ${i + 1}`,
            tier: playerTier,
            greenFee: result.breakdown.greenFee,
            cleaningFee: result.breakdown.cleaningFee,
            cartFee: result.breakdown.cartFee,
        });

        totalGreenFee += result.breakdown.greenFee;
        totalCleaningFee += result.breakdown.cleaningFee;
        totalCartFee += result.breakdown.cartFee;
    }

    // 桿弟費用（按配比整組計算）
    const caddyFeeResult = await calculateTotalFee({
        tier: mainUserTier,
        holes: booking.holes,
        isHoliday: holiday,
        caddyRatio: caddyRatio,
        numPlayers: 1
    }, rateConfig);
    const caddyFee = caddyFeeResult.breakdown.caddyFee;

    const subtotal = totalGreenFee + totalCleaningFee + totalCartFee + caddyFee;
    const taxRate = rateConfig.tax_config?.entertainment_tax || 0.05;
    const entertainmentTax = Math.round(subtotal * taxRate);
    const totalAmount = subtotal + entertainmentTax;

    const feesBreakdown = {
        greenFee: totalGreenFee,
        cleaningFee: totalCleaningFee,
        cartFee: totalCartFee,
        caddyFee: caddyFee,
        subtotal: subtotal,
        entertainmentTax: entertainmentTax,
        taxRate: taxRate,
        perPlayer: perPlayerFees,
        metadata: {
            holes: booking.holes,
            isHoliday: holiday,
            caddyRatio: caddyRatio,
            playersCount: playersCount
        }
    };

    // 6. 儲存收費卡
    const { data: chargeCard, error: insertError } = await supabase
        .from('charge_cards')
        .insert({
            booking_id: bookingId,
            caddy_id: caddyId || null,
            caddy_ratio: caddyRatio,
            course: course || 'A -> B',
            fees_breakdown: feesBreakdown,
            total_amount: totalAmount,
            status: 'created'
        })
        .select()
        .single();

    if (insertError) {
        throw new Error(`產生收費卡失敗: ${insertError.message}`);
    }

    return {
        chargeCard,
        booking,
        caddy,
        feesBreakdown,
        totalAmount
    };
}

/**
 * 查詢預約的收費卡
 */
async function getChargeCardByBooking(bookingId) {
    const { data, error } = await supabase
        .from('charge_cards')
        .select('*, caddies(*)')
        .eq('booking_id', bookingId)
        .neq('status', 'voided')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error) return null;
    return data;
}

/**
 * 發送收費卡 LINE 通知
 */
async function sendChargeCardNotification(chargeCardId) {
    // 讀取收費卡 + 預約 + 桿弟
    const { data: card, error } = await supabase
        .from('charge_cards')
        .select('*, caddies(*)')
        .eq('id', chargeCardId)
        .single();

    if (error || !card) {
        throw new Error('找不到收費卡');
    }

    const { data: booking } = await supabase
        .from('bookings')
        .select('*, users(display_name, line_user_id)')
        .eq('id', card.booking_id)
        .single();

    if (!booking) {
        throw new Error('找不到預約資料');
    }

    const results = [];
    const players = booking.players_info || [];
    const caddy = card.caddies;
    const dateStr = booking.date;
    const departureTime = booking.scheduled_departure_time
        ? booking.scheduled_departure_time.substring(0, 5)
        : null;

    // 找主預約人的 LINE ID
    if (booking.users?.line_user_id) {
        const messages = buildChargeCardMessage({
            playerName: booking.users.display_name || '球友',
            caddyName: caddy?.name || '未指派',
            caddyNumber: caddy?.caddy_number || '-',
            departureTime,
            date: dateStr
        });
        const result = await sendPushMessage(booking.users.line_user_id, messages);
        results.push({ name: booking.users.display_name, ...result });
    }

    // 找其他球員的 LINE ID（透過 phone 查詢）
    for (const player of players) {
        if (!player.phone) continue;
        // 跳過主預約人（避免重複通知）
        if (player.phone === booking.users?.phone) continue;

        const { data: userData } = await supabase
            .from('users')
            .select('line_user_id, display_name')
            .eq('phone', player.phone)
            .single();

        if (userData?.line_user_id) {
            const messages = buildChargeCardMessage({
                playerName: player.name || userData.display_name || '球友',
                caddyName: caddy?.name || '未指派',
                caddyNumber: caddy?.caddy_number || '-',
                departureTime,
                date: dateStr
            });
            const result = await sendPushMessage(userData.line_user_id, messages);
            results.push({ name: player.name, ...result });
        } else {
            results.push({ name: player.name, success: false, reason: 'no_line_id' });
        }
    }

    // 更新通知狀態
    const sentCount = results.filter(r => r.success).length;
    if (sentCount > 0) {
        await supabase
            .from('charge_cards')
            .update({
                notification_sent: true,
                notification_sent_at: new Date(),
                updated_at: new Date()
            })
            .eq('id', chargeCardId);
    }

    return {
        total: results.length,
        sent: sentCount,
        failed: results.length - sentCount,
        details: results
    };
}

module.exports = {
    generateChargeCard,
    getChargeCardByBooking,
    sendChargeCardNotification,
    golferTypeToTier
};

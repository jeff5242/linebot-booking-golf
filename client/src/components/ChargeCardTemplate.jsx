import React from 'react';

/**
 * 大衛營高爾夫球場收費卡模板
 * 純呈現元件，接受 props 渲染收費卡
 */
export default function ChargeCardTemplate({ booking, chargeCard, caddy, feesBreakdown }) {
    if (!booking || !chargeCard) return null;

    const mainPlayer = booking.players_info?.[0] || {};
    const user = booking.users || {};
    const dateStr = booking.date?.replace(/-/g, '/');
    const timeStr = booking.scheduled_departure_time
        ? booking.scheduled_departure_time.substring(0, 5)
        : booking.time?.substring(0, 5) || '--:--';
    const cardId = `DC-${chargeCard.id?.substring(0, 8).toUpperCase()}`;

    const formatMoney = (n) => {
        if (n == null) return '$ 0';
        return `$ ${n.toLocaleString()}`;
    };

    // 取得每人費用（使用第一位球員資料）
    const perPlayer = feesBreakdown?.perPlayer?.[0] || {};
    const taxRate = feesBreakdown?.taxRate || 0.05;
    const perPersonTax = Math.round(((perPlayer.greenFee || 0) + (perPlayer.cartFee || 0)) * taxRate);
    const perPersonTotal = (perPlayer.greenFee || 0) + (perPlayer.cleaningFee || 0) +
        (perPlayer.cartFee || 0) + (perPlayer.caddyFee || 0) + perPersonTax;

    return (
        <div className="charge-card-print-area">
            <style>{`
                .charge-card {
                    width: 800px;
                    border: 2px solid #000;
                    padding: 20px;
                    margin: 20px auto;
                    font-family: "Microsoft JhengHei", Arial, sans-serif;
                    color: #333;
                    background: #fff;
                }
                .charge-card .header {
                    text-align: center;
                    border-bottom: 2px solid #000;
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }
                .charge-card .header h1 {
                    margin: 0;
                    font-size: 24px;
                    letter-spacing: 5px;
                }
                .charge-card .header p {
                    margin: 4px 0 0;
                    font-size: 14px;
                    color: #666;
                }
                .charge-card .info-section {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 12px;
                }
                .charge-card .info-box {
                    font-size: 15px;
                    font-weight: bold;
                }
                .charge-card .info-box span {
                    font-weight: normal;
                }
                .charge-card table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                }
                .charge-card table, .charge-card th, .charge-card td {
                    border: 1px solid #000;
                }
                .charge-card th {
                    background-color: #f2f2f2;
                    padding: 10px;
                    text-align: center;
                    font-size: 15px;
                }
                .charge-card td {
                    padding: 10px;
                    text-align: right;
                    font-size: 15px;
                }
                .charge-card .label-cell {
                    text-align: left;
                    width: 50%;
                    font-weight: bold;
                }
                .charge-card .caddy-row {
                    background-color: #fff9c4;
                }
                .charge-card .total-section {
                    border-top: 2px double #000;
                    padding-top: 10px;
                    text-align: right;
                    font-size: 20px;
                    font-weight: bold;
                    margin-bottom: 15px;
                }
                .charge-card .instruction-box {
                    border: 2px dashed red;
                    padding: 12px;
                    margin-top: 15px;
                    color: red;
                    text-align: center;
                    font-weight: bold;
                    font-size: 16px;
                }
                .charge-card .footer-note {
                    margin-top: 20px;
                    font-size: 12px;
                    border-top: 1px dashed #ccc;
                    padding-top: 10px;
                    color: #666;
                }
                .charge-card .players-list {
                    font-size: 13px;
                    color: #555;
                    margin-bottom: 15px;
                }

                @media print {
                    body * { visibility: hidden; }
                    .charge-card-print-area, .charge-card-print-area * { visibility: visible; }
                    .charge-card-print-area { position: absolute; left: 0; top: 0; }
                    .charge-card { border: 2px solid #000 !important; }
                }
            `}</style>

            <div className="charge-card">
                {/* Header */}
                <div className="header">
                    <h1>大衛營高爾夫球場收費卡</h1>
                    <p>DAVID CAMP GOLF CLUB - CHARGE CARD</p>
                </div>

                {/* 基本資訊 Row 1 */}
                <div className="info-section">
                    <div className="info-box">日期：<span>{dateStr}</span></div>
                    <div className="info-box">姓名：<span>{user.display_name || mainPlayer.name || '--'} ({user.golfer_type || '來賓'})</span></div>
                    <div className="info-box">編號：<span>{cardId}</span></div>
                </div>

                {/* 基本資訊 Row 2 */}
                <div className="info-section">
                    <div className="info-box">洞數：<span>{booking.holes} 洞</span></div>
                    <div className="info-box">球道：<span>{chargeCard.course || 'A -> B'}</span></div>
                    <div className="info-box">出發時間：<span>{timeStr}</span></div>
                </div>

                {/* 同組球友列表 */}
                {booking.players_count > 1 && booking.players_info?.length > 0 && (
                    <div className="players-list">
                        同組球友：{booking.players_info.map(p => p.name).filter(Boolean).join('、')}
                        （共 {booking.players_count} 人）
                    </div>
                )}

                {/* 費用明細（每人） */}
                <table>
                    <thead>
                        <tr>
                            <th>收費項目 (Description)</th>
                            <th>每人金額 (Per Person)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="label-cell">果嶺費 (Green Fee)</td>
                            <td>{formatMoney(perPlayer.greenFee)}</td>
                        </tr>
                        <tr>
                            <td className="label-cell">設施清潔費 (Maintenance Fee)</td>
                            <td>{formatMoney(perPlayer.cleaningFee)}</td>
                        </tr>
                        {perPlayer.cartFee > 0 && (
                            <tr>
                                <td className="label-cell">球車費 (Cart Fee)</td>
                                <td>{formatMoney(perPlayer.cartFee)}</td>
                            </tr>
                        )}
                        {perPlayer.caddyFee > 0 && (
                            <tr className="caddy-row">
                                <td className="label-cell">代收桿弟費 (Caddy Fee - {chargeCard.caddy_ratio})</td>
                                <td>{formatMoney(perPlayer.caddyFee)}</td>
                            </tr>
                        )}
                        <tr>
                            <td className="label-cell">代收娛樂稅 (Entertainment Tax {taxRate * 100}%)</td>
                            <td>{formatMoney(perPersonTax)}</td>
                        </tr>
                    </tbody>
                </table>

                {/* 每人合計 */}
                <div className="total-section">
                    每人預計金額 (Per Person Total): {formatMoney(perPersonTotal)}
                </div>

                {/* 桿弟指派與集合指引 */}
                <div className="instruction-box">
                    {caddy ? (
                        <>報到指引：請持本卡前往出發台找【 桿弟：{caddy.name} / 編號：{caddy.caddy_number} 】集合。</>
                    ) : (
                        <>報到指引：請持本卡前往出發台集合。</>
                    )}
                </div>

                {/* Footer */}
                <div className="footer-note">
                    * 本卡僅供當日預計消費參考，實際金額以櫃檯結帳為準。如有餐飲或其他消費將另行計入。
                </div>
            </div>
        </div>
    );
}

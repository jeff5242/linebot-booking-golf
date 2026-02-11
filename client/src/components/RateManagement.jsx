import React, { useState, useEffect } from 'react';
import { DollarSign, Calculator, Save, Send, Check, X, History, Users, TrendingUp } from 'lucide-react';

export function RateManagement() {
    const [rateConfig, setRateConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState('');

    // 試算工具狀態
    const [calculator, setCalculator] = useState({
        tier: 'gold',
        holes: 18,
        isHoliday: false,
        caddyRatio: '1:4',
        numPlayers: 4
    });
    const [calculatedFee, setCalculatedFee] = useState(null);

    const memberTiers = [
        { code: 'platinum', name: '白金會員', color: 'purple' },
        { code: 'gold', name: '金卡會員', color: 'yellow' },
        { code: 'team_friend', name: '球隊/友人', color: 'blue' },
        { code: 'guest', name: '一般來賓', color: 'gray' }
    ];

    const caddyRatios = ['1:1', '1:2', '1:3', '1:4'];

    useEffect(() => {
        fetchActiveRate();
    }, []);

    useEffect(() => {
        if (rateConfig) {
            calculateFee();
        }
    }, [calculator, rateConfig]);

    const fetchActiveRate = async () => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${apiUrl}/api/rates/active`);
            const data = await res.json();
            if (res.ok) {
                setRateConfig(data);
            }
        } catch (error) {
            setMsg('載入失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const calculateFee = async () => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${apiUrl}/api/rates/calculate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(calculator)
            });
            const data = await res.json();
            if (res.ok) {
                setCalculatedFee(data);
            }
        } catch (error) {
            console.error('計算失敗:', error);
        }
    };

    const updateGreenFee = (tier, holes, dayType, value) => {
        setRateConfig(prev => ({
            ...prev,
            green_fees: {
                ...prev.green_fees,
                [tier]: {
                    ...prev.green_fees[tier],
                    [holes]: {
                        ...prev.green_fees[tier][holes],
                        [dayType]: parseInt(value) || 0
                    }
                }
            }
        }));
    };

    const updateCaddyFee = (ratio, holes, value) => {
        setRateConfig(prev => ({
            ...prev,
            caddy_fees: {
                ...prev.caddy_fees,
                [ratio]: {
                    ...prev.caddy_fees[ratio],
                    [holes]: parseInt(value) || 0
                }
            }
        }));
    };

    const updateBaseFee = (type, holes, value) => {
        setRateConfig(prev => ({
            ...prev,
            base_fees: {
                ...prev.base_fees,
                [type]: {
                    ...prev.base_fees[type],
                    [holes]: parseInt(value) || 0
                }
            }
        }));
    };

    const handleSave = async () => {
        setLoading(true);
        setMsg('');
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${apiUrl}/api/rates/${rateConfig.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rateConfig)
            });
            if (res.ok) {
                setMsg('✅ 儲存成功！');
                setTimeout(() => setMsg(''), 3000);
            } else {
                throw new Error('儲存失敗');
            }
        } catch (error) {
            setMsg('❌ ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
    );

    if (!rateConfig) return (
        <div className="text-center text-gray-500 py-8">無法載入費率配置</div>
    );

    return (
        <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="flex items-center justify-between bg-white p-6 rounded-lg shadow">
                <div className="flex items-center gap-3">
                    <DollarSign className="w-8 h-8 text-green-600" />
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">費率管理系統</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            版本 {rateConfig.version_number} | 狀態: <span className="font-semibold text-green-600">{rateConfig.status}</span>
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg shadow disabled:opacity-50 transition-colors"
                >
                    <Save className="w-4 h-4" />
                    儲存設定
                </button>
            </div>

            {msg && (
                <div className={`p-4 rounded-lg ${msg.includes('❌') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                    {msg}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 左側：費率設定 */}
                <div className="lg:col-span-2 space-y-6">
                    {/* 果嶺費矩陣 */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <TrendingUp className="w-5 h-5 text-blue-600" />
                            <h3 className="text-lg font-semibold text-gray-900">果嶺費設定</h3>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-700">會員等級</th>
                                        <th className="px-4 py-3 text-center font-semibold text-gray-700">9洞平日</th>
                                        <th className="px-4 py-3 text-center font-semibold text-gray-700">9洞假日</th>
                                        <th className="px-4 py-3 text-center font-semibold text-gray-700">18洞平日</th>
                                        <th className="px-4 py-3 text-center font-semibold text-gray-700">18洞假日</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {memberTiers.map(tier => (
                                        <tr key={tier.code} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium text-gray-900">{tier.name}</td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    value={rateConfig.green_fees[tier.code]['9'].weekday}
                                                    onChange={(e) => updateGreenFee(tier.code, '9', 'weekday', e.target.value)}
                                                    disabled={tier.code === 'platinum'}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    value={rateConfig.green_fees[tier.code]['9'].holiday}
                                                    onChange={(e) => {
                                                        if (tier.code === 'platinum') {
                                                            updateGreenFee(tier.code, '9', 'weekday', e.target.value);
                                                            updateGreenFee(tier.code, '9', 'holiday', e.target.value);
                                                        } else {
                                                            updateGreenFee(tier.code, '9', 'holiday', e.target.value);
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    value={rateConfig.green_fees[tier.code]['18'].weekday}
                                                    onChange={(e) => updateGreenFee(tier.code, '18', 'weekday', e.target.value)}
                                                    disabled={tier.code === 'platinum'}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    value={rateConfig.green_fees[tier.code]['18'].holiday}
                                                    onChange={(e) => {
                                                        if (tier.code === 'platinum') {
                                                            updateGreenFee(tier.code, '18', 'weekday', e.target.value);
                                                            updateGreenFee(tier.code, '18', 'holiday', e.target.value);
                                                        } else {
                                                            updateGreenFee(tier.code, '18', 'holiday', e.target.value);
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {rateConfig.green_fees.platinum && (
                            <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
                                <span className="text-purple-600">★</span>
                                白金會員平假日價格自動同步
                            </p>
                        )}
                    </div>

                    {/* 桿弟費設定 */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Users className="w-5 h-5 text-orange-600" />
                            <h3 className="text-lg font-semibold text-gray-900">桿弟費設定（配比）</h3>
                        </div>

                        <div className="grid grid-cols-4 gap-4">
                            {caddyRatios.map(ratio => (
                                <div key={ratio} className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                                    <div className="text-center font-semibold text-orange-900 mb-3">{ratio}</div>
                                    <div className="space-y-2">
                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1">9洞</label>
                                            <input
                                                type="number"
                                                value={rateConfig.caddy_fees[ratio]['9']}
                                                onChange={(e) => updateCaddyFee(ratio, '9', e.target.value)}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-center text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1">18洞</label>
                                            <input
                                                type="number"
                                                value={rateConfig.caddy_fees[ratio]['18']}
                                                onChange={(e) => updateCaddyFee(ratio, '18', e.target.value)}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-center text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 基礎費用 */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">基礎費用與稅率</h3>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">清潔費 - 9洞</label>
                                <input
                                    type="number"
                                    value={rateConfig.base_fees.cleaning['9']}
                                    onChange={(e) => updateBaseFee('cleaning', '9', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">清潔費 - 18洞</label>
                                <input
                                    type="number"
                                    value={rateConfig.base_fees.cleaning['18']}
                                    onChange={(e) => updateBaseFee('cleaning', '18', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">球車費（每人）- 9洞</label>
                                <input
                                    type="number"
                                    value={rateConfig.base_fees.cart_per_person['9']}
                                    onChange={(e) => updateBaseFee('cart_per_person', '9', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">球車費（每人）- 18洞</label>
                                <input
                                    type="number"
                                    value={rateConfig.base_fees.cart_per_person['18']}
                                    onChange={(e) => updateBaseFee('cart_per_person', '18', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded"
                                />
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <label className="block text-sm font-medium text-gray-700 mb-2">娛樂稅率</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={rateConfig.tax_config.entertainment_tax * 100}
                                    onChange={(e) => setRateConfig(prev => ({
                                        ...prev,
                                        tax_config: { entertainment_tax: parseFloat(e.target.value) / 100 }
                                    }))}
                                    className="w-24 px-3 py-2 border border-gray-300 rounded"
                                    step="0.1"
                                />
                                <span className="text-gray-600">%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 右側：即時試算工具 */}
                <div className="lg:col-span-1">
                    <div className="sticky top-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-lg p-6 border border-blue-200">
                        <div className="flex items-center gap-2 mb-4">
                            <Calculator className="w-6 h-6 text-blue-600" />
                            <h3 className="text-lg font-semibold text-gray-900">即時試算工具</h3>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">會員等級</label>
                                <select
                                    value={calculator.tier}
                                    onChange={(e) => setCalculator({ ...calculator, tier: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                                >
                                    {memberTiers.map(tier => (
                                        <option key={tier.code} value={tier.code}>{tier.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">球洞數</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setCalculator({ ...calculator, holes: 9 })}
                                        className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                                            calculator.holes === 9
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white text-gray-700 border border-gray-300'
                                        }`}
                                    >
                                        9洞
                                    </button>
                                    <button
                                        onClick={() => setCalculator({ ...calculator, holes: 18 })}
                                        className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                                            calculator.holes === 18
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white text-gray-700 border border-gray-300'
                                        }`}
                                    >
                                        18洞
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">日期類型</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setCalculator({ ...calculator, isHoliday: false })}
                                        className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                                            !calculator.isHoliday
                                                ? 'bg-green-600 text-white'
                                                : 'bg-white text-gray-700 border border-gray-300'
                                        }`}
                                    >
                                        平日
                                    </button>
                                    <button
                                        onClick={() => setCalculator({ ...calculator, isHoliday: true })}
                                        className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                                            calculator.isHoliday
                                                ? 'bg-orange-600 text-white'
                                                : 'bg-white text-gray-700 border border-gray-300'
                                        }`}
                                    >
                                        假日
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">桿弟配比</label>
                                <select
                                    value={calculator.caddyRatio}
                                    onChange={(e) => setCalculator({ ...calculator, caddyRatio: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                                >
                                    {caddyRatios.map(ratio => (
                                        <option key={ratio} value={ratio}>{ratio}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">人數</label>
                                <input
                                    type="number"
                                    value={calculator.numPlayers}
                                    onChange={(e) => setCalculator({ ...calculator, numPlayers: parseInt(e.target.value) || 1 })}
                                    min="1"
                                    max="4"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                />
                            </div>
                        </div>

                        {/* 收費卡預覽 */}
                        {calculatedFee && (
                            <div className="mt-6 bg-white rounded-lg p-4 shadow border border-gray-200">
                                <div className="text-center mb-3">
                                    <div className="text-sm text-gray-600">總計金額</div>
                                    <div className="text-3xl font-bold text-blue-600">
                                        ${calculatedFee.totalAmount.toLocaleString()}
                                    </div>
                                </div>

                                <div className="border-t border-gray-200 pt-3 space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">果嶺費</span>
                                        <span className="font-semibold">${calculatedFee.breakdown.greenFee.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">清潔費</span>
                                        <span className="font-semibold">${calculatedFee.breakdown.cleaningFee.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">球車費</span>
                                        <span className="font-semibold">${calculatedFee.breakdown.cartFee.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">桿弟費</span>
                                        <span className="font-semibold">${calculatedFee.breakdown.caddyFee.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between pt-2 border-t border-gray-200">
                                        <span className="text-gray-600">小計</span>
                                        <span className="font-semibold">${calculatedFee.breakdown.subtotal.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-orange-600">
                                        <span>娛樂稅 (5%)</span>
                                        <span className="font-semibold">${calculatedFee.breakdown.entertainmentTax.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

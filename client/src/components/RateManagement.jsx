import React, { useState, useEffect } from 'react';
import { DollarSign, Calculator, Save, Send, Check, X, History, Users, TrendingUp, Package } from 'lucide-react';
import { adminFetch } from '../utils/adminApi';

export function RateManagement() {
    const [rateConfig, setRateConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState('');
    const [voucherSettings, setVoucherSettings] = useState(null);
    const [voucherSaving, setVoucherSaving] = useState(false);

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
        fetchVoucherSettings();
    }, []);

    const fetchVoucherSettings = async () => {
        try {
            const res = await adminFetch('/api/voucher-ops/settings');
            if (res.ok) {
                const data = await res.json();
                setVoucherSettings(data);
            }
        } catch {}
    };

    const updatePackageField = (index, field, value) => {
        setVoucherSettings(prev => ({
            ...prev,
            packages: prev.packages.map((pkg, i) =>
                i === index ? { ...pkg, [field]: field === 'name' ? value : (parseInt(value) || 0) } : pkg
            ),
        }));
    };

    const updateVoucherPrice = (type, value) => {
        setVoucherSettings(prev => ({
            ...prev,
            [type]: { ...prev[type], unit_price: parseInt(value) || 0 },
        }));
    };

    const handleSaveVoucherSettings = async () => {
        setVoucherSaving(true);
        try {
            const res = await adminFetch('/api/voucher-ops/settings', {
                method: 'POST',
                body: JSON.stringify(voucherSettings),
            });
            if (res.ok) {
                setMsg('✅ 票券套本設定已儲存！');
                setTimeout(() => setMsg(''), 3000);
            } else {
                throw new Error('儲存失敗');
            }
        } catch (err) {
            setMsg('❌ 票券設定儲存失敗: ' + err.message);
        } finally {
            setVoucherSaving(false);
        }
    };

    useEffect(() => {
        if (rateConfig) {
            calculateFee();
        }
    }, [calculator, rateConfig]);

    const fetchActiveRate = async () => {
        try {
            const res = await adminFetch('/api/rates/active');
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
            const res = await adminFetch('/api/rates/calculate', {
                method: 'POST',
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
            const res = await adminFetch(`/api/rates/${rateConfig.id}`, {
                method: 'PUT',
                body: JSON.stringify(rateConfig)
            });
            const result = await res.json();
            if (res.ok) {
                setMsg('✅ 儲存成功！');
                setTimeout(() => setMsg(''), 3000);
            } else {
                throw new Error(result.error || '儲存失敗');
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

                    {/* 票券套本設定 */}
                    {voucherSettings && (
                        <div className="bg-white rounded-lg shadow p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Package className="w-5 h-5 text-purple-600" />
                                    <h3 className="text-lg font-semibold text-gray-900">票券套本設定</h3>
                                </div>
                                <button
                                    onClick={handleSaveVoucherSettings}
                                    disabled={voucherSaving}
                                    className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                                >
                                    <Save className="w-3.5 h-3.5" />
                                    {voucherSaving ? '儲存中...' : '儲存'}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">果嶺券單價</label>
                                    <input
                                        type="number"
                                        value={voucherSettings.green_fee?.unit_price ?? 200}
                                        onChange={(e) => updateVoucherPrice('green_fee', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded text-center"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">商品券單價</label>
                                    <input
                                        type="number"
                                        value={voucherSettings.product?.unit_price ?? 100}
                                        onChange={(e) => updateVoucherPrice('product', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded text-center"
                                    />
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-purple-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ minWidth: '240px' }}>套本名稱</th>
                                            <th className="px-4 py-3 text-center font-semibold text-gray-700">果嶺券張數</th>
                                            <th className="px-4 py-3 text-center font-semibold text-gray-700">商品券張數</th>
                                            <th className="px-4 py-3 text-center font-semibold text-gray-700">售價</th>
                                            <th className="px-4 py-3 text-center font-semibold text-gray-700" style={{ width: '50px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {(voucherSettings.packages || []).map((pkg, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="text"
                                                        value={pkg.name}
                                                        onChange={(e) => updatePackageField(i, 'name', e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded"
                                                        style={{ minWidth: '200px' }}
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="number"
                                                        value={pkg.green_fee}
                                                        onChange={(e) => updatePackageField(i, 'green_fee', e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded text-center"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="number"
                                                        value={pkg.product}
                                                        onChange={(e) => updatePackageField(i, 'product', e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded text-center"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="number"
                                                        value={pkg.price}
                                                        onChange={(e) => updatePackageField(i, 'price', e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded text-center"
                                                    />
                                                </td>
                                                <td className="px-2 py-3 text-center">
                                                    {(voucherSettings.packages || []).length > 1 && (
                                                        <button
                                                            onClick={() => setVoucherSettings(prev => ({
                                                                ...prev,
                                                                packages: prev.packages.filter((_, idx) => idx !== i),
                                                            }))}
                                                            className="text-red-400 hover:text-red-600 text-lg"
                                                            title="刪除此套本"
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <button
                                onClick={() => setVoucherSettings(prev => ({
                                    ...prev,
                                    packages: [...(prev.packages || []), { name: '新套本', price: 0, green_fee: 0, product: 0 }],
                                }))}
                                className="mt-3 flex items-center gap-1 text-purple-600 hover:text-purple-800 text-sm font-medium"
                            >
                                + 新增套本
                            </button>
                        </div>
                    )}

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
                                    <div className="text-sm text-gray-600">預計總計金額 ({calculator.numPlayers}人)</div>
                                    <div className="text-3xl font-bold text-blue-600">
                                        ${calculatedFee.totalAmount.toLocaleString()}
                                    </div>
                                </div>

                                <div className="border-t border-gray-200 pt-3 space-y-2 text-sm">
                                    <div className="text-xs text-gray-400 mb-1">每人費用</div>
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
                                        <span className="text-gray-600">桿弟費 ({calculator.caddyRatio})</span>
                                        <span className="font-semibold">${calculatedFee.breakdown.caddyFee.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-orange-600">
                                        <span>娛樂稅 ({Math.round((calculatedFee.metadata?.taxRate || 0.05) * 100)}%)</span>
                                        <span className="font-semibold">${calculatedFee.breakdown.entertainmentTaxPerPerson.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold text-gray-900">
                                        <span>每人小計</span>
                                        <span>${calculatedFee.breakdown.totalPerPerson.toLocaleString()}</span>
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

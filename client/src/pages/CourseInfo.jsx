import React, { useEffect, useState } from 'react';
import { sendLiffMessage } from '../utils/liffHelper';

export function CourseInfo() {
    const [rates, setRates] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        document.title = '球場資訊';
        // Send log
        sendLiffMessage('查看球場資訊');

        const fetchRates = async () => {
            try {
                const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
                const res = await fetch(`${apiUrl}/api/rates/active`);
                if (!res.ok) {
                    throw new Error('Failed to fetch rates');
                }
                const data = await res.json();
                setRates(data);
            } catch (err) {
                console.error('Error fetching rates:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchRates();
    }, []);

    const calculatePrice = (tier, holes, isHoliday) => {
        if (!rates) return '---';
        try {
            const typeKey = isHoliday ? 'holiday' : 'weekday';
            const greenFee = rates.green_fees[tier][holes][typeKey];
            const cleaningFee = rates.base_fees.cleaning[holes];
            const cartFee = rates.base_fees.cart_per_person[holes];

            // Default to 1:4 caddy ratio if available, otherwise try 1:1 or first available
            let caddyFee = 0;
            if (rates.caddy_fees['1:4']) {
                caddyFee = rates.caddy_fees['1:4'][holes];
            } else if (rates.caddy_fees['1:1']) {
                caddyFee = rates.caddy_fees['1:1'][holes];
            } else {
                // Fallback: take the first key
                const firstKey = Object.keys(rates.caddy_fees)[0];
                if (firstKey) caddyFee = rates.caddy_fees[firstKey][holes];
            }

            const taxRate = rates.tax_config.entertainment_tax || 0.05;
            const tax = Math.round((greenFee + cartFee) * taxRate);

            const total = greenFee + cleaningFee + cartFee + caddyFee + tax;
            return total.toLocaleString();
        } catch (e) {
            console.error('Price calc error:', e);
            return 'N/A';
        }
    };

    const facilities = [
        { title: '練習場', icon: '⛳️', desc: '全天候開放，擁有 50 個打位。' },
        { title: '切球區', icon: '🏌️', desc: '專業級短切果嶺，模擬真實場地。' },
        { title: '餐廳', icon: '🍽️', desc: '提供精緻餐點，俯瞰球場美景。' },
        { title: '淋浴間', icon: '🚿', desc: '乾淨舒適的空間，提供全套沐浴用品。' },
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Hero Section */}
            <div className="bg-green-800 text-white py-12 px-6 text-center shadow-md">
                <h1 className="text-3xl font-bold mb-2">大衛營高爾夫球場 (九洞)</h1>
                <p className="text-green-200">享受揮桿樂趣的最佳選擇</p>
            </div>

            <div className="max-w-4xl mx-auto w-full p-6 space-y-8">
                {/* Course Intro */}
                <section className="bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">球場簡介</h2>
                    <div className="space-y-4 text-gray-600 leading-relaxed">
                        <p>
                            <span className="font-bold text-gray-800">特色：</span>
                            球場設計風景優美，以七個水池作為主要障礙，考驗準度。雖然只有九洞，但採雙果嶺設計（一洞兩果嶺），讓前後九洞有不同體驗。全長約 待確認 碼。
                        </p>
                        <p>
                            <span className="font-bold text-gray-800">非典型球場：</span>
                            該球場屬於非教育部的社區運動休閒設施，鼓勵步行擊球以健身。
                        </p>
                        <p>
                            <span className="font-bold text-gray-800">初學者友善：</span>
                            因球道保養良好且收費較低，常被視為高雄球友入門高爾夫的 First Choice。
                        </p>
                    </div>
                </section>

                {/* Location */}
                <section className="bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">位置與交通</h2>
                    <div className="space-y-2 text-gray-600">
                        <p><span className="font-bold">地點：</span>高雄市旗山區大林里溝坪路98-1號。</p>
                        <p><span className="font-bold">環境：</span>坐落於山區，風景秀麗，類似世外桃源。</p>
                    </div>
                </section>

                {/* Fees */}
                <section className="bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">收費標準</h2>
                    {loading ? (
                        <div className="text-center py-8 text-gray-500">載入價格中...</div>
                    ) : error ? (
                        <div className="text-center py-8 text-red-500">無法載入價格資訊</div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-green-50 text-green-800 text-sm uppercase">
                                            <th className="py-3 px-4 border-b border-green-100">身份別</th>
                                            <th className="py-3 px-4 border-b border-green-100 text-center">9 洞 (平日/假日)</th>
                                            <th className="py-3 px-4 border-b border-green-100 text-center">18 洞 (平日/假日)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-gray-700">
                                        <tr className="border-b last:border-0 hover:bg-gray-50">
                                            <td className="py-4 px-4 font-bold text-gray-800">白金會員 (Platinum)</td>
                                            <td className="py-4 px-4 text-center">
                                                <span className="font-medium text-green-700">${calculatePrice('platinum', 9, false)}</span>
                                                <span className="mx-2 text-gray-300">/</span>
                                                <span className="font-medium text-red-600">${calculatePrice('platinum', 9, true)}</span>
                                            </td>
                                            <td className="py-4 px-4 text-center">
                                                <span className="font-medium text-green-700">${calculatePrice('platinum', 18, false)}</span>
                                                <span className="mx-2 text-gray-300">/</span>
                                                <span className="font-medium text-red-600">${calculatePrice('platinum', 18, true)}</span>
                                            </td>
                                        </tr>
                                        <tr className="border-b last:border-0 hover:bg-gray-50">
                                            <td className="py-4 px-4 font-bold text-gray-800">金卡會員 (Gold)</td>
                                            <td className="py-4 px-4 text-center">
                                                <span className="font-medium text-green-700">${calculatePrice('gold', 9, false)}</span>
                                                <span className="mx-2 text-gray-300">/</span>
                                                <span className="font-medium text-red-600">${calculatePrice('gold', 9, true)}</span>
                                            </td>
                                            <td className="py-4 px-4 text-center">
                                                <span className="font-medium text-green-700">${calculatePrice('gold', 18, false)}</span>
                                                <span className="mx-2 text-gray-300">/</span>
                                                <span className="font-medium text-red-600">${calculatePrice('gold', 18, true)}</span>
                                            </td>
                                        </tr>
                                        <tr className="border-b last:border-0 hover:bg-gray-50">
                                            <td className="py-4 px-4 font-bold text-gray-800">來賓 (Guest)</td>
                                            <td className="py-4 px-4 text-center">
                                                <span className="font-medium text-green-700">${calculatePrice('guest', 9, false)}</span>
                                                <span className="mx-2 text-gray-300">/</span>
                                                <span className="font-medium text-red-600">${calculatePrice('guest', 9, true)}</span>
                                            </td>
                                            <td className="py-4 px-4 text-center">
                                                <span className="font-medium text-green-700">${calculatePrice('guest', 18, false)}</span>
                                                <span className="mx-2 text-gray-300">/</span>
                                                <span className="font-medium text-red-600">${calculatePrice('guest', 18, true)}</span>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <p className="mt-4 text-xs text-gray-500">
                                * 以上價格包含：果嶺費、桿弟費（1:4）、球車費、清潔費及娛樂稅。<br />
                                * 實際費用可能因桿弟配比調整而有所變動，以現場報價為準。
                            </p>
                        </>
                    )}
                </section>

                {/* Facilities */}
                <section className="bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">設施服務</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {facilities.map((item, idx) => (
                            <div key={idx} className="flex items-start p-4 bg-gray-50 rounded-lg">
                                <span className="text-3xl mr-3">{item.icon}</span>
                                <div>
                                    <h3 className="font-bold text-gray-800">{item.title}</h3>
                                    <p className="text-sm text-gray-600 mt-1">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

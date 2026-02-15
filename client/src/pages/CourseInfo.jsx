import React from 'react';

export function CourseInfo() {
    const fees = [
        { type: '平日 (早球)', price: '2,200', note: '06:00 - 08:00' },
        { type: '平日 (一般)', price: '2,800', note: '08:00 - 14:00' },
        { type: '假日 (早球)', price: '3,200', note: '06:00 - 08:00' },
        { type: '假日 (一般)', price: '3,800', note: '08:00 - 14:00' },
    ];

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
                <h1 className="text-3xl font-bold mb-2">大衛營高爾夫球場</h1>
                <p className="text-green-200">享受揮桿樂趣的最佳選擇</p>
            </div>

            <div className="max-w-4xl mx-auto w-full p-6 space-y-8">
                {/* Course Intro */}
                <section className="bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">球場簡介</h2>
                    <p className="text-gray-600 leading-relaxed">
                        大衛營高爾夫球場座落於風景秀麗的山林之間，擁有標準 18 洞設計。
                        球道起伏多變，極具挑戰性，適合各級球友前來挑戰。我們致力於提供最優質的擊球體驗與服務。
                    </p>
                </section>

                {/* Fees */}
                <section className="bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">收費標準</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-gray-100 text-gray-600 text-sm uppercase">
                                    <th className="py-3 px-4">時段</th>
                                    <th className="py-3 px-4">價格 (NT$)</th>
                                    <th className="py-3 px-4">備註</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-700">
                                {fees.map((fee, idx) => (
                                    <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                                        <td className="py-3 px-4 font-medium">{fee.type}</td>
                                        <td className="py-3 px-4 text-green-700 font-bold">{fee.price}</td>
                                        <td className="py-3 px-4 text-gray-500 text-sm">{fee.note}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-4 text-xs text-gray-400">* 價格包含果嶺費、桿弟費、球車費與保險。</p>
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

                {/* Contact/Map Placeholder */}
                <section className="bg-white rounded-xl shadow-sm p-6 text-center">
                    <h2 className="text-xl font-bold text-gray-800 mb-2">聯絡我們</h2>
                    <p className="text-gray-600">地址：桃園市大溪區大衛營路 1 號</p>
                    <p className="text-gray-600">電話：(03) 123-4567</p>
                    <div className="mt-4 bg-gray-200 h-48 rounded-lg flex items-center justify-center text-gray-500">
                        [Google Map Placeholder]
                    </div>
                </section>
            </div>
        </div>
    );
}

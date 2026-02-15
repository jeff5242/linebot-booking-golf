import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { sendLiffMessage } from '../utils/liffHelper';

export function Fortune() {
    const [revealed, setRevealed] = useState(false);
    const [fortune, setFortune] = useState(null);
    const navigate = useNavigate();
    const [isMember, setIsMember] = useState(false);

    React.useEffect(() => {
        const checkMember = () => {
            const phone = localStorage.getItem('golf_user_phone');
            if (phone) setIsMember(true);
        };
        checkMember();
        // Send logs
        sendLiffMessage('查看運勢卡');
    }, []);

    const fortunes = [
        { title: "大吉", desc: "今日運勢極佳，揮桿如有神助！" },
        { title: "中吉", desc: "平穩發揮，切桿精準，有望抓鳥。" },
        { title: "小吉", desc: "心平氣和，享受擊球樂趣。" },
        { title: "平", desc: "多加練習，基本功最重要。" },
        { title: "吉", desc: "球運不錯，長推有機會進洞。" },
    ];

    // Import helper
    // Since this file didn't import sendLiffMessage, I need to add it or Dynamic Import?
    // Let's do dynamic import or assume I will add import statement in another step?
    // It's safer to use multi_replace for imports.
    // I will return and use multi_replace instead.

    const handleDraw = () => {
        if (revealed) return;
        const randomFortune = fortunes[Math.floor(Math.random() * fortunes.length)];
        setFortune(randomFortune);
        setRevealed(true);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black text-white flex flex-col items-center justify-center p-4">
            <motion.h1
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-3xl font-bold mb-8 tracking-widest text-yellow-400"
            >
                今日球運
            </motion.h1>

            <div className="relative w-full max-w-sm aspect-[3/4]">
                <AnimatePresence>
                    {!revealed ? (
                        <motion.div
                            key="card-back"
                            initial={{ rotateY: 0 }}
                            exit={{ rotateY: 90, opacity: 0 }}
                            transition={{ duration: 0.5 }}
                            onClick={handleDraw}
                            className="absolute inset-0 bg-gradient-to-br from-yellow-600 to-yellow-800 rounded-xl shadow-2xl border-4 border-yellow-400 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
                        >
                            <div className="text-6xl">🔮</div>
                            <p className="absolute bottom-10 text-yellow-200 font-serif">點擊抽籤</p>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="card-front"
                            initial={{ rotateY: -90, opacity: 0 }}
                            animate={{ rotateY: 0, opacity: 1 }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className="absolute inset-0 bg-white rounded-xl shadow-2xl flex flex-col items-center justify-center p-6 text-center border-4 border-yellow-400"
                        >
                            <h2 className="text-5xl font-bold text-red-600 mb-4">{fortune.title}</h2>
                            <p className="text-xl text-gray-800 font-medium leading-relaxed">
                                {fortune.desc}
                            </p>
                            <button
                                onClick={() => setRevealed(false)}
                                className="mt-8 px-6 py-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors"
                            >
                                再抽一次
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>


            <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
                onClick={() => navigate(isMember ? '/member' : '/register')}
                className="mt-12 px-8 py-3 bg-white text-indigo-900 rounded-full font-bold shadow-lg hover:bg-gray-100 transition-colors"
            >
                {isMember ? '前往會員專區' : '立即加入會員'}
            </motion.button>
        </div >
    );
}

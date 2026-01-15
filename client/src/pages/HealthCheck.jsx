import React, { useState } from 'react';
import { supabase } from '../supabase';
import { generateDailySlots, isSlotAvailable } from '../utils/golfLogic';
import { format } from 'date-fns';

export function HealthCheck() {
    const [results, setResults] = useState([]);
    const [testing, setTesting] = useState(false);

    const addResult = (test, status, message, details = null) => {
        setResults(prev => [...prev, { test, status, message, details, time: new Date().toLocaleTimeString() }]);
    };

    const runTests = async () => {
        setResults([]);
        setTesting(true);

        try {
            // Test 1: Supabase Connection
            addResult('Supabase 連線', 'testing', '測試中...');
            try {
                const { data, error } = await supabase.from('users').select('count', { count: 'exact', head: true });
                if (error) throw error;
                addResult('Supabase 連線', 'success', '連線成功');
            } catch (e) {
                addResult('Supabase 連線', 'error', '連線失敗', e.message);
            }

            // Test 2: Users Table
            addResult('Users 資料表', 'testing', '測試中...');
            try {
                const { data, error } = await supabase.from('users').select('*').limit(1);
                if (error) throw error;
                addResult('Users 資料表', 'success', `可讀取，共 ${data?.length || 0} 筆測試資料`);
            } catch (e) {
                addResult('Users 資料表', 'error', '讀取失敗', e.message);
            }

            // Test 3: Bookings Table
            addResult('Bookings 資料表', 'testing', '測試中...');
            try {
                const { data, error } = await supabase.from('bookings').select('*').limit(1);
                if (error) throw error;
                addResult('Bookings 資料表', 'success', `可讀取，共 ${data?.length || 0} 筆測試資料`);
            } catch (e) {
                addResult('Bookings 資料表', 'error', '讀取失敗', e.message);
            }

            // Test 4: Insert Test User
            addResult('新增測試用戶', 'testing', '測試中...');
            try {
                const testPhone = '0900000000';
                const { data: existing } = await supabase.from('users').select('*').eq('phone', testPhone);

                if (existing && existing.length > 0) {
                    addResult('新增測試用戶', 'success', '測試用戶已存在');
                } else {
                    const { error } = await supabase.from('users').insert([{
                        line_user_id: 'test_' + Date.now(),
                        phone: testPhone,
                        display_name: '測試用戶'
                    }]);
                    if (error) throw error;
                    addResult('新增測試用戶', 'success', '成功建立測試用戶');
                }
            } catch (e) {
                addResult('新增測試用戶', 'error', '建立失敗', e.message);
            }

            // Test 5: Create Test Booking
            addResult('新增測試預約', 'testing', '測試中...');
            try {
                const { data: user } = await supabase.from('users').select('id').eq('phone', '0900000000').single();
                if (!user) throw new Error('找不到測試用戶');

                const testDate = format(new Date(), 'yyyy-MM-dd');
                const { error } = await supabase.from('bookings').insert([{
                    user_id: user.id,
                    date: testDate,
                    time: '08:00:00',
                    holes: 9,
                    players_count: 4,
                    status: 'confirmed',
                    players_info: [{ name: '測試1', phone: '0900000001' }],
                    needs_cart: true,
                    needs_caddie: true
                }]);

                if (error && !error.message.includes('duplicate')) throw error;
                addResult('新增測試預約', 'success', '預約功能正常');
            } catch (e) {
                addResult('新增測試預約', 'error', '預約失敗', e.message);
            }

            // Test 6: Query Bookings with User Info
            addResult('查詢預約（含用戶資訊）', 'testing', '測試中...');
            try {
                const { data, error } = await supabase
                    .from('bookings')
                    .select('*, users(display_name, phone)')
                    .limit(1);
                if (error) throw error;
                addResult('查詢預約（含用戶資訊）', 'success', 'JOIN 查詢正常');
            } catch (e) {
                addResult('查詢預約（含用戶資訊）', 'error', 'JOIN 查詢失敗', e.message);
            }

            // Test 7: Update Booking Status
            addResult('更新預約狀態', 'testing', '測試中...');
            try {
                const { data: booking } = await supabase
                    .from('bookings')
                    .select('id')
                    .eq('time', '08:00:00')
                    .limit(1)
                    .single();

                if (booking) {
                    const { error } = await supabase
                        .from('bookings')
                        .update({ status: 'checked_in', checkin_time: new Date().toISOString() })
                        .eq('id', booking.id);
                    if (error) throw error;
                    addResult('更新預約狀態', 'success', '狀態更新正常');
                } else {
                    addResult('更新預約狀態', 'warning', '沒有測試資料可更新');
                }
            } catch (e) {
                addResult('更新預約狀態', 'error', '更新失敗', e.message);
            }

            // Test 8: Golf Logic - Generate Slots
            addResult('時段生成邏輯', 'testing', '測試中...');
            try {
                const slots = generateDailySlots(new Date());
                if (slots.length === 61) { // 05:30 to 15:30, 10min interval = 61 slots
                    addResult('時段生成邏輯', 'success', `正確生成 ${slots.length} 個時段`);
                } else {
                    addResult('時段生成邏輯', 'warning', `生成 ${slots.length} 個時段（預期 61 個）`);
                }
            } catch (e) {
                addResult('時段生成邏輯', 'error', '生成失敗', e.message);
            }

            // Test 9: Golf Logic - Slot Availability
            addResult('時段可用性檢查', 'testing', '測試中...');
            try {
                const testSlot = new Date();
                testSlot.setHours(10, 0, 0, 0);
                const isAvailable = isSlotAvailable(testSlot, [], 18);
                if (isAvailable === true) {
                    addResult('時段可用性檢查', 'success', '邏輯運算正常');
                } else {
                    addResult('時段可用性檢查', 'error', '邏輯異常');
                }
            } catch (e) {
                addResult('時段可用性檢查', 'error', '檢查失敗', e.message);
            }

            // Test 10: Environment Variables
            addResult('環境變數檢查', 'testing', '測試中...');
            const envVars = {
                'VITE_SUPABASE_URL': import.meta.env.VITE_SUPABASE_URL,
                'VITE_SUPABASE_ANON_KEY': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'VITE_LIFF_ID': import.meta.env.VITE_LIFF_ID
            };
            const missingVars = Object.entries(envVars).filter(([k, v]) => !v).map(([k]) => k);
            if (missingVars.length === 0) {
                addResult('環境變數檢查', 'success', '所有環境變數已設定');
            } else {
                addResult('環境變數檢查', 'error', `缺少環境變數: ${missingVars.join(', ')}`);
            }

        } catch (e) {
            addResult('系統錯誤', 'error', '測試過程發生錯誤', e.message);
        }

        setTesting(false);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'success': return '#10b981';
            case 'error': return '#ef4444';
            case 'warning': return '#f59e0b';
            case 'testing': return '#3b82f6';
            default: return '#6b7280';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'success': return '✓';
            case 'error': return '✗';
            case 'warning': return '⚠';
            case 'testing': return '⟳';
            default: return '○';
        }
    };

    return (
        <div className="container" style={{ maxWidth: '900px' }}>
            <h1 className="title">系統健康檢查</h1>

            <div className="card" style={{ marginBottom: '20px' }}>
                <button
                    onClick={runTests}
                    disabled={testing}
                    className="btn btn-primary"
                    style={{ width: '100%', fontSize: '1.1rem' }}>
                    {testing ? '測試中...' : '開始測試'}
                </button>
            </div>

            {results.length > 0 && (
                <div className="card">
                    <h2 style={{ marginBottom: '16px', fontSize: '1.2rem' }}>測試結果</h2>

                    <div style={{ marginBottom: '16px' }}>
                        <strong>總計：</strong> {results.length} 項測試 |
                        <span style={{ color: '#10b981', marginLeft: '8px' }}>
                            成功 {results.filter(r => r.status === 'success').length}
                        </span> |
                        <span style={{ color: '#ef4444', marginLeft: '8px' }}>
                            失敗 {results.filter(r => r.status === 'error').length}
                        </span> |
                        <span style={{ color: '#f59e0b', marginLeft: '8px' }}>
                            警告 {results.filter(r => r.status === 'warning').length}
                        </span>
                    </div>

                    {results.map((result, index) => (
                        <div
                            key={index}
                            style={{
                                padding: '12px',
                                marginBottom: '8px',
                                borderLeft: `4px solid ${getStatusColor(result.status)}`,
                                backgroundColor: '#f9fafb',
                                borderRadius: '4px'
                            }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        fontSize: '1.2rem',
                                        color: getStatusColor(result.status),
                                        fontWeight: 'bold'
                                    }}>
                                        {getStatusIcon(result.status)}
                                    </span>
                                    <strong>{result.test}</strong>
                                </div>
                                <span style={{ fontSize: '0.8rem', color: '#666' }}>{result.time}</span>
                            </div>
                            <div style={{ marginTop: '4px', marginLeft: '28px', fontSize: '0.9rem' }}>
                                {result.message}
                            </div>
                            {result.details && (
                                <div style={{
                                    marginTop: '8px',
                                    marginLeft: '28px',
                                    padding: '8px',
                                    backgroundColor: '#fee2e2',
                                    borderRadius: '4px',
                                    fontSize: '0.85rem',
                                    fontFamily: 'monospace',
                                    color: '#991b1b'
                                }}>
                                    {result.details}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div className="card" style={{ marginTop: '20px', backgroundColor: '#f0f9ff' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>📋 檢查項目</h3>
                <ul style={{ fontSize: '0.9rem', lineHeight: '1.8', color: '#374151' }}>
                    <li>Supabase 資料庫連線</li>
                    <li>Users 資料表讀寫</li>
                    <li>Bookings 資料表讀寫</li>
                    <li>用戶註冊功能</li>
                    <li>預約建立功能</li>
                    <li>JOIN 查詢（用戶+預約）</li>
                    <li>狀態更新功能</li>
                    <li>時段生成邏輯</li>
                    <li>時段可用性檢查</li>
                    <li>環境變數設定</li>
                </ul>
            </div>
        </div>
    );
}

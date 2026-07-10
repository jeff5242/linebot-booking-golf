import React, { useState, useEffect } from 'react';
import { adminFetch } from '../utils/adminApi';

const DEFAULT_PACKAGES = [
    { name: 'A 套本 $6,600', price: 6600, green_fee: 18, product: 30 },
    { name: 'B 套本 $2,800', price: 2800, green_fee: 9, product: 10 },
];

const inputStyle = { padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' };
const fieldRow = { display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' };
const fieldLabel = { width: '120px', fontSize: '14px', fontWeight: '500', flexShrink: 0, color: '#374151' };
const fieldInput = { ...inputStyle, width: '100%', flex: 1 };
const sectionTitle = { fontSize: '15px', fontWeight: '700', marginBottom: '12px', color: '#111827' };
const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' };

// 電子票券發券設定（券價 / 預設張數 / 有效年限 / 套本設定）。
// 從「發券/用券」移到「系統參數設定」的獨立頁籤，僅具 settings 權限者可調整。
export function VoucherIssueSettings() {
    const defaults = {
        green_fee: { unit_price: 200, default_quantity: 10 },
        product: { unit_price: 100, default_quantity: 10 },
        packages: DEFAULT_PACKAGES,
        validity_years: 1,
    };
    const [form, setForm] = useState(defaults);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await adminFetch('/api/voucher-ops/settings');
                if (res.ok) {
                    const data = await res.json();
                    setForm({ ...defaults, ...data });
                }
            } catch (e) {
                console.error('讀取發券設定失敗:', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const updateField = (path, value) => {
        setForm(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            const keys = path.split('.');
            let obj = next;
            for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
            obj[keys[keys.length - 1]] = value;
            return next;
        });
    };

    const updatePackage = (idx, field, value) => {
        setForm(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            next.packages[idx][field] = value;
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setMsg('');
        try {
            const res = await adminFetch('/api/voucher-ops/settings', {
                method: 'POST',
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.error) setMsg('儲存失敗：' + data.error);
            else setMsg('設定已儲存');
        } catch (err) {
            setMsg('儲存失敗：' + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ color: '#9ca3af', padding: '20px' }}>載入設定中...</div>;

    return (
        <div style={{ maxWidth: '640px' }}>
            <div style={cardStyle}>
                <h4 style={sectionTitle}>果嶺券</h4>
                <div style={fieldRow}>
                    <span style={fieldLabel}>單價</span>
                    <input type="number" value={form.green_fee.unit_price} onChange={e => updateField('green_fee.unit_price', parseInt(e.target.value) || 0)} style={fieldInput} />
                </div>
                <div style={fieldRow}>
                    <span style={fieldLabel}>預設張數</span>
                    <input type="number" value={form.green_fee.default_quantity} onChange={e => updateField('green_fee.default_quantity', parseInt(e.target.value) || 0)} style={fieldInput} />
                </div>
            </div>

            <div style={cardStyle}>
                <h4 style={sectionTitle}>商品券</h4>
                <div style={fieldRow}>
                    <span style={fieldLabel}>單價</span>
                    <input type="number" value={form.product.unit_price} onChange={e => updateField('product.unit_price', parseInt(e.target.value) || 0)} style={fieldInput} />
                </div>
                <div style={fieldRow}>
                    <span style={fieldLabel}>預設張數</span>
                    <input type="number" value={form.product.default_quantity} onChange={e => updateField('product.default_quantity', parseInt(e.target.value) || 0)} style={fieldInput} />
                </div>
            </div>

            <div style={cardStyle}>
                <h4 style={sectionTitle}>有效年限</h4>
                <div style={fieldRow}>
                    <span style={fieldLabel}>年數</span>
                    <input type="number" min="1" max="10" value={form.validity_years} onChange={e => updateField('validity_years', parseInt(e.target.value) || 1)} style={fieldInput} />
                </div>
            </div>

            <div style={cardStyle}>
                <h4 style={sectionTitle}>套本設定</h4>
                {(form.packages || []).map((pkg, i) => (
                    <div key={i} style={{ padding: '12px', background: '#f5f3ff', borderRadius: '8px', marginBottom: '10px', position: 'relative' }}>
                        {(form.packages || []).length > 1 && (
                            <button
                                onClick={() => setForm(prev => ({ ...prev, packages: prev.packages.filter((_, idx) => idx !== i) }))}
                                style={{ position: 'absolute', top: '8px', right: '10px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px' }}
                                title="刪除此套本"
                            >✕</button>
                        )}
                        <div style={fieldRow}>
                            <span style={fieldLabel}>名稱</span>
                            <input type="text" value={pkg.name} onChange={e => updatePackage(i, 'name', e.target.value)} style={fieldInput} />
                        </div>
                        <div style={fieldRow}>
                            <span style={fieldLabel}>售價</span>
                            <input type="number" value={pkg.price} onChange={e => updatePackage(i, 'price', parseInt(e.target.value) || 0)} style={fieldInput} />
                        </div>
                        <div style={fieldRow}>
                            <span style={fieldLabel}>果嶺券張數</span>
                            <input type="number" value={pkg.green_fee} onChange={e => updatePackage(i, 'green_fee', parseInt(e.target.value) || 0)} style={fieldInput} />
                        </div>
                        <div style={fieldRow}>
                            <span style={fieldLabel}>商品券張數</span>
                            <input type="number" value={pkg.product} onChange={e => updatePackage(i, 'product', parseInt(e.target.value) || 0)} style={fieldInput} />
                        </div>
                    </div>
                ))}
                <button
                    onClick={() => setForm(prev => ({ ...prev, packages: [...(prev.packages || []), { name: '新套本', price: 0, green_fee: 0, product: 0 }] }))}
                    style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: '14px', fontWeight: '500', padding: '4px 0' }}
                >
                    + 新增套本
                </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={handleSave} disabled={saving} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: saving ? '#d1d5db' : '#2563eb', color: '#fff', fontWeight: '600', cursor: saving ? 'default' : 'pointer' }}>
                    {saving ? '儲存中...' : '儲存電子票券設定'}
                </button>
                {msg && <span style={{ fontSize: '14px', fontWeight: '500', color: msg.includes('失敗') ? '#dc2626' : '#16a34a' }}>{msg}</span>}
            </div>
        </div>
    );
}

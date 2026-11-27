import React, { useState } from 'react';
import { isPlayerCheckedIn } from '../utils/playerCheckin';
import { savePlayerToggle, saveWholeGroup } from '../utils/playerCheckinStore';

const chipBase = {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    minHeight: '32px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
};
const chipIn = { ...chipBase, background: '#187a50', color: '#fff', border: '1px solid #187a50' };
const chipOut = { ...chipBase, background: '#fff', color: '#1f2937', border: '1px solid #9ca3af' };

/**
 * 出發台看板：每位組員一個按鈕，按一下報到、再按一下取消。白底＝未報到，綠底＝已報到。
 * @param {{ booking: object, onChanged: () => void }} props
 */
export default function PlayerCheckinChips({ booking, onChanged }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const players = Array.isArray(booking.players_info) ? booking.players_info : [];
    const states = players.map((_, i) => isPlayerCheckedIn(booking, i));
    const allIn = players.length > 0 && states.every(Boolean);

    const run = async (fn) => {
        setBusy(true);
        setError('');
        try {
            await fn();
            onChanged();
        } catch (e) {
            setError(e.message || '報到失敗');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {players.map((p, i) => {
                    const name = String(p?.name || '').trim() || `球友 ${i + 1}`;
                    return (
                        <button
                            key={i}
                            type="button"
                            disabled={busy}
                            onClick={() => run(() => savePlayerToggle(booking.id, i))}
                            style={{ ...(states[i] ? chipIn : chipOut), opacity: busy ? 0.6 : 1 }}
                            aria-pressed={states[i]}
                            title={states[i] ? `${name} 已報到，按一下取消` : `${name} 按一下報到`}
                        >
                            {states[i] && <span aria-hidden="true">✓</span>}
                            {name}
                        </button>
                    );
                })}
                {!allIn && players.length > 1 && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => saveWholeGroup(booking.id))}
                        className="btn"
                        style={{ padding: '4px 8px', fontSize: '0.8rem', width: 'auto' }}
                    >
                        全組報到
                    </button>
                )}
            </div>
            {error && <div role="alert" style={{ color: '#dc2626', fontSize: '0.8rem' }}>{error}</div>}
        </div>
    );
}

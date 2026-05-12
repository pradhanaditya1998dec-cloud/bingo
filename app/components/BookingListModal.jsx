"use client";
import React from "react";

export default function BookingListModal({ onClose, tickets = {} }) {
    // Convert tickets object to array and sort by ID
    const allTickets = Object.values(tickets)
        .sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
    const bookedCount = allTickets.filter(t => t.status === 'booked').length;

    return (
        <div className="disclaimer-overlay" onClick={onClose}>
            <div className="disclaimer-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: '90%' }}>
                <div className="disclaimer-header">
                    <span className="disclaimer-icon">📋</span>
                    <div>
                        <h2 className="disclaimer-title">Booking List</h2>
                        <p className="disclaimer-subtitle">Current Game Bookings ({bookedCount} / {allTickets.length})</p>
                    </div>
                    <button className="disclaimer-close-btn" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
                </div>
                <div className="disclaimer-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: 0 }}>
                    {allTickets.length === 0 ? (
                        <div className="loading" style={{ padding: '40px 0', textAlign: 'center' }}>No tickets found for this game.</div>
                    ) : (
                        <table className="sp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--accent)' }}>Ticket</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--accent)' }}>Name</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--accent)' }}>Phone</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allTickets.map((t, i) => (
                                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span className="mono-chip" style={t.status === 'booked' ? { background: '#91ecb436', borderColor: '#12f76aff', color: '#12f76aff' } : {}}>{t.id}</span>
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: t.status === 'booked' ? 'var(--text)' : 'var(--text-dim)' }}>
                                            {t.status === 'booked' && t.userName ? t.userName : "—"}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                            {t.status === 'booked' && t.userPhone ? t.userPhone : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

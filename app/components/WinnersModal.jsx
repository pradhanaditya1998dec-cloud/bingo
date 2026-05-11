"use client";
import { useEffect, useState } from "react";
import { getAllPastGames } from "../lib/gameStore";
import { WIN_TYPES, WIN_LABELS, reconstructGrid, formatGameId } from "../lib/tambola";

function GameWinnersCard({ game }) {
    const winners = game.winners || {};
    const winnerEntries = WIN_TYPES
        .map(type => ({ type, data: winners[type] }))
        .filter(w => w.data);

    return (
        <div className="game-card" style={{ marginBottom: 16 }}>
            <div className="game-card-header">
                <div>
                    <h2 className="game-date">{formatGameId(game.id)}</h2>
                    <span className="game-stats">
                        {game.calledNumbers?.length || 0}&nbsp;numbers called
                        &nbsp;·&nbsp;
                        <span className={`game-badge ${game.status}`}>{game.status}</span>
                    </span>
                </div>
            </div>

            {/* Winner rows */}
            <div className="game-winners">
                {winnerEntries.length === 0 ? (
                    <p className="no-winners-text">No winners recorded</p>
                ) : (
                    winnerEntries.map(({ type, data }) => {
                        const winnerList = Array.isArray(data) ? data : [data];
                        return (
                            <div key={type} className="history-winner-row">
                                <span className="hw-type">{WIN_LABELS[type]}</span>
                                <span className="hw-name">
                                    {winnerList.map((w, i) => (
                                        <span key={i}>
                                            {w.userName}
                                            {i < winnerList.length - 1 ? " & " : ""}
                                        </span>
                                    ))}
                                </span>
                                <span className="hw-ticket">
                                    {winnerList.map(w => w.ticketId).join(", ")}
                                </span>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export default function WinnersModal({ onClose }) {
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getAllPastGames().then(g => { setGames(g); setLoading(false); });
    }, []);

    return (
        <div className="disclaimer-overlay" onClick={onClose}>
            <div className="disclaimer-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, width: '90%' }}>
                <div className="disclaimer-header">
                    <span className="disclaimer-icon">🏆</span>
                    <div>
                        <h2 className="disclaimer-title">WINNERS</h2>
                        <p className="disclaimer-subtitle">Hall of Fame — All Past Games</p>
                    </div>
                    <button className="disclaimer-close-btn" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
                </div>
                <div className="disclaimer-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                    {loading ? (
                        <div className="loading" style={{ padding: '40px 0' }}>Loading past games…</div>
                    ) : games.length === 0 ? (
                        <div className="loading" style={{ padding: '40px 0' }}>No completed games yet. Check back after the first game!</div>
                    ) : (
                        <div className="games-list">
                            {games.map(game => (
                                <GameWinnersCard key={game.id} game={game} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

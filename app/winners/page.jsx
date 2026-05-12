"use client";
// app/winners/page.jsx
import { useEffect, useState } from "react";
import { getAllPastGames, getGameTickets } from "../lib/gameStore";
import { WIN_TYPES, WIN_LABELS, reconstructGrid, formatGameId } from "../lib/tambola";
import Link from "next/link";

function MiniTicket({ ticket, calledNumbers = [] }) {
    const called = new Set(calledNumbers);
    const grid = Array.isArray(ticket.numbers[0])
        ? ticket.numbers
        : reconstructGrid(ticket.numbers);

    return (
        <div className="mini-ticket">
            <div className="mini-ticket-grid">
                {grid.map((row, ri) => (
                    <div key={ri} className="mini-ticket-row">
                        {row.map((num, ci) => (
                            <div
                                key={ci}
                                className={`mini-cell ${num === 0 || num === null ? "blank" : called.has(num) ? "marked" : "active"}`}
                            >
                                {num !== 0 && num !== null ? num : ""}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

function GameWinnersCard({ game }) {
    const winners = game.winners || {};
    const winnerEntries = WIN_TYPES
        .map(type => ({ type, data: winners[type] }))
        .filter(w => w.data);

    return (
        <div className="game-card">
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
                        // Handle both array (new) and single object (legacy)
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
export default function WinnersPage() {
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        // getAllPastGames already returns newest-first via createdAt sort in gameStore
        getAllPastGames().then(g => { setGames(g); setLoading(false); });
    }, []);

    return (
        <div className="page">
            <header className="site-header">
                <div className="header-content">
                    <div>
                        <h1 className="site-title">WINNERS</h1>
                        <p className="site-subtitle">Hall of Fame — All Past Games</p>
                    </div>

                    {/* Desktop nav */}
                    <nav className="header-nav desktop-nav">
                        <Link href="/rules" className="nav-link">📋 Rules</Link>
                        <Link href="/" className="nav-link">← Back to Game</Link>
                    </nav>

                    {/* Mobile hamburger */}
                    <button
                        className="hamburger"
                        onClick={() => setMenuOpen(o => !o)}
                        aria-label="Open menu"
                        aria-expanded={menuOpen}
                    >
                        <span /><span /><span />
                    </button>
                </div>

                {/* Mobile dropdown */}
                {menuOpen && (
                    <nav className="mobile-nav" onClick={() => setMenuOpen(false)}>
                        <Link href="/rules" className="mobile-nav-link">📋 Rules</Link>
                        <Link href="/" className="mobile-nav-link">← Back to Game</Link>
                    </nav>
                )}
            </header>

            <main className="winners-page-main">
                {loading ? (
                    <div className="loading">Loading past games…</div>
                ) : games.length === 0 ? (
                    <div className="loading">No completed games yet. Check back after the first game!</div>
                ) : (
                    <div className="games-list">
                        {games.map(game => (
                            <GameWinnersCard key={game.id} game={game} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}



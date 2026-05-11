"use client";
// app/rules/page.jsx
import { useState } from "react";
import Link from "next/link";

export default function RulesPage() {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className="page">
            <header className="site-header">
                <div className="header-content">
                    <div>
                        <h1 className="site-title">RULES</h1>
                        <p className="site-subtitle">How to Play Tambola</p>
                    </div>

                    {/* Desktop nav */}
                    <nav className="header-nav desktop-nav">
                        <Link href="/winners" className="nav-link">🏆 Past Winners</Link>
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
                        <Link href="/winners" className="mobile-nav-link">🏆 Past Winners</Link>
                        <Link href="/" className="mobile-nav-link">← Back to Game</Link>
                    </nav>
                )}
            </header>

            <main className="rules-main">

                <div className="rules-card">
                    <div className="rules-card-icon">🎟️</div>
                    <h2>The Ticket</h2>
                    <p>
                        Each ticket has <strong>3 rows × 9 columns</strong>. Every row has exactly{" "}
                        <strong>5 numbers</strong> and 4 blank spaces. Numbers run from{" "}
                        <strong>1 to 90</strong>, distributed across columns — column 1 holds
                        numbers 1–9, column 2 holds 10–19, and so on up to column 9 which holds 80–90.
                    </p>
                    <div className="rules-ticket-demo">
                        {[
                            [5, 0, 23, 0, 0, 52, 0, 0, 0],
                            [0, 16, 0, 36, 0, 0, 64, 0, 80],
                            [0, 0, 0, 40, 48, 0, 67, 79, 0],
                        ].map((row, ri) => (
                            <div key={ri} className="rules-demo-row">
                                {row.map((n, ci) => (
                                    <div key={ci} className={`rules-demo-cell ${n === 0 ? "blank" : ""}`}>
                                        {n !== 0 ? n : ""}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rules-card">
                    <div className="rules-card-icon">🎱</div>
                    <h2>The Draw</h2>
                    <p>
                        The host randomly draws numbers <strong>1–90</strong> one at a time.
                        Each number is announced and displayed on the board. Mark it off on
                        your ticket if you have it. Numbers are never repeated in the same game.
                    </p>
                </div>

                <div className="rules-card">
                        <div className="rules-card-icon">🏆</div>
                        <h2>Winning Prizes</h2>
                        <p>There are five prizes per game, claimed in this order:</p>
                        <div className="rules-prizes">
                            <div className="rules-prize-row">
                                <span className="prize-icon">⚡</span>
                                <div>
                                    <strong>Quick 7</strong>
                                    <p>First to have any <em>7 numbers</em> on your ticket called out. Speed wins this one!</p>
                                </div>
                            </div>
                            <div className="rules-prize-row">
                                <span className="prize-icon">🎯</span>
                                <div>
                                    <strong>Top Line</strong>
                                    <p>First to mark all 5 numbers on the <em>top row</em> of your ticket.</p>
                                </div>
                            </div>
                            <div className="rules-prize-row">
                                <span className="prize-icon">🎯</span>
                                <div>
                                    <strong>Middle Line</strong>
                                    <p>First to mark all 5 numbers on the <em>middle row</em> of your ticket.</p>
                                </div>
                            </div>
                            <div className="rules-prize-row">
                                <span className="prize-icon">🎯</span>
                                <div>
                                    <strong>Last Line</strong>
                                    <p>First to mark all 5 numbers on the <em>bottom row</em> of your ticket.</p>
                                </div>
                            </div>
                            <div className="rules-prize-row full-house">
                                <span className="prize-icon">🏆</span>
                                <div>
                                    <strong>Full House</strong>
                                    <p>First to mark <em>all 15 numbers</em> on your ticket. This ends the game!</p>
                                </div>
                            </div>
                        </div>
                    </div>

               <div className="rules-card">
                    <div className="rules-card-icon">📋</div>
                    <h2>General Rules</h2>
                    <ul className="rules-list">
                        <li>Each player may hold one or more tickets.</li>
                        <li>The same player can win multiple prizes in a single game.</li>
                        <li>Not all prizes may be active in every game — check with the host.</li>
                        <li>The host's decision is final in all disputes.</li>
                        <li>Most importantly — have fun! 🎉</li>
                    </ul>
                </div>

                <div className="rules-back-row">
                    <Link href="/" className="admin-btn primary rules-back-btn">
                        ← Back to Game
                    </Link>
                </div>

            </main>
        </div>
    );
}
// components/DisclaimerModal.jsx
"use client";
import { useEffect, useState } from "react";

export default function DisclaimerModal() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        setVisible(true);
    }, []);

    function accept() {
        setVisible(false);
    }

    if (!visible) return null;

    return (
        <div className="disclaimer-overlay" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
            <div className="disclaimer-modal">

                {/* ── Header ── */}
                <div className="disclaimer-header">
                    <span className="disclaimer-icon">🎱</span>
                    <div style={{ flex: 1 }}>
                        <h2 id="disclaimer-title" className="disclaimer-title">Before You Play</h2>
                        <p className="disclaimer-subtitle">Please read before joining today's game</p>
                    </div>
                    <button className="disclaimer-close-btn" onClick={accept} aria-label="Close">
                        ✕
                    </button>
                </div>


                {/* ── Scrollable body ── */}
                <div className="disclaimer-body">
                    <p className="disclaimer-intro">
                        Welcome to <strong>Tambola Daily Housie</strong>! Joining means you agree to the following:
                    </p>

                    <ul className="disclaimer-list">
                        {/* <li>
                            <span className="disclaimer-bullet">🎮</span>
                            <span>This game is organised purely for <strong>entertainment and fun</strong> among friends and family.</span>
                        </li> */}
                        <li>
                            <span className="disclaimer-bullet">💰</span>
                            <span>Any prize money collected is <strong>community-pooled</strong> and distributed to winners transparently. No rake or commission is charged.</span>
                        </li>
                        <li>
                            <span className="disclaimer-bullet">🔞</span>
                            <span>Participation is intended for <strong>adults (18+)</strong> only.</span>
                        </li>
                        <li>
                            <span className="disclaimer-bullet">📵</span>
                            <span>Tickets once booked are <strong>non-refundable</strong>. Please confirm before booking.</span>
                        </li>
                        <li>
                            <span className="disclaimer-bullet">⚖️</span>
                            <span>The organiser's decision on all winning claims is <strong>final and binding</strong>.</span>
                        </li>
                        <li>
                            <span className="disclaimer-bullet">🚫</span>
                            <span>This is <strong>not a commercial gambling platform</strong>. Participation is entirely voluntary.</span>
                        </li>
                    </ul>
                </div>

                {/* ── Footer — outside scroll area ── */}
                <div className="disclaimer-footer">
                    <p className="disclaimer-footer-note">
                        By continuing you confirm you have read and understood these terms.
                    </p>
                    <button className="disclaimer-accept-btn" onClick={accept}>
                        I Understand — Let's Play! 🎉
                    </button>
                </div>

            </div>
        </div>
    );
}
"use client";
// app/page.jsx
import { useEffect, useState, useRef } from "react";
import {
  subscribeActiveGameId,
  subscribeGame,
  subscribeTickets,
  buildWhatsAppLink,
  subscribeAdminSettings,
} from "./lib/gameStore";
import { formatGameId, reconstructGrid } from "./lib/tambola";
import { announceNumber, preloadAudio, initAudio, playGameStartCountdown, playAudioFile, playAudioFileLooping, stopLoopingAudio, playAudioFilePriority } from "./lib/audioManager";
import TicketCard from "./components/TicketCard";
import NumberBoard from "./components/NumberBoard";
import WinnersPanel from "./components/WinnersPanel";
import DisclaimerModal from "./components/DisclaimerModal";
import RulesModal from "./components/RulesModal";
import WinnersModal from "./components/WinnersModal";
import BookingListModal from "./components/BookingListModal";

// const ADMIN_PHONE = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || "917628863362";

export default function GamePage() {
  // ── Active game ID — driven by Firestore meta pointer ──────────────────
  // This is the key fix: instead of computing a static gameId at render time,
  // we subscribe to games/_meta and re-subscribe to game+tickets whenever the
  // admin starts a new game. Users never need to refresh.
  const [gameId, setGameId] = useState(null);

  const [game, setGame] = useState(null);
  const [tickets, setTickets] = useState({});
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState("");
  const [selectedTickets, setSelectedTickets] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'rules' | 'winners' | null
  const [toast, setToast] = useState(null);

  const countdownRef = useRef(null);
  const prevWinnersRef = useRef(null);
  const prevCalled = useRef([]);
  const isInitialLoad = useRef(true);

  // Unsubscribe refs — cleaned up when gameId changes
  const unsubGameRef = useRef(null);
  const unsubTicketsRef = useRef(null);


  const [adminPhone, setAdminPhone] = useState(
    process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || "917628863362" // fallback until Firestore loads
  );

  useEffect(() => {
    return subscribeAdminSettings(s => {
      if (s.adminPhone) setAdminPhone(s.adminPhone);
    });
  }, []);

  // ── Step 1: subscribe to the active game pointer ──────────────────────
  useEffect(() => {
    const unsub = subscribeActiveGameId((id) => {
      setGameId(id);           // triggers Step 2
      if (!id) setLoading(false); // no game exists yet
    });
    return unsub;
  }, []);

  // ── Step 2: whenever gameId changes, re-subscribe to game + tickets ───
  useEffect(() => {
    // Tear down previous subscriptions
    unsubGameRef.current?.();
    unsubTicketsRef.current?.();

    if (!gameId) {
      setGame(null);
      setTickets({});
      return;
    }

    // Reset state for the new game so stale data never shows
    setGame(null);
    setTickets({});
    setSelectedTickets([]);
    prevCalled.current = [];
    isInitialLoad.current = true;
    setLoading(true);

    unsubGameRef.current = subscribeGame(gameId, (data) => {
      if (isInitialLoad.current) {
        prevCalled.current = data?.calledNumbers || [];
        isInitialLoad.current = false;
      }
      setGame(data);
      setLoading(false);
    });

    unsubTicketsRef.current = subscribeTickets(gameId, (data) => {
      setTickets(data);
    });

    return () => {
      unsubGameRef.current?.();
      unsubTicketsRef.current?.();
    };
  }, [gameId]);

  // // ── Announce newly called numbers ─────────────────────────────────────
  // useEffect(() => {
  //   if (!game?.calledNumbers?.length) return;
  //   const prev = new Set(prevCalled.current);
  //   const newNums = game.calledNumbers.filter((n) => !prev.has(n));
  //   if (newNums.length) {
  //     if (game.status !== "closed") {
  //       announceNumber(newNums[newNums.length - 1]);
  //     }
  //     prevCalled.current = game.calledNumbers;
  //   }
  // }, [game?.calledNumbers, game?.status]);

  // ── Countdown to scheduled start ──────────────────────────────────────
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (!game?.scheduledAt || game.status !== "waiting") { setCountdown(""); return; }
    function tick() {
      const diff = game.scheduledAt - Date.now();
      if (diff <= 0) { clearInterval(countdownRef.current); setCountdown("Starting now…"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const parts = [];
      if (h > 0) parts.push(String(h).padStart(2, "0"));
      parts.push(String(m).padStart(2, "0"));
      parts.push(String(s).padStart(2, "0"));
      setCountdown(parts.join(":"));
    }
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => clearInterval(countdownRef.current);
  }, [game?.scheduledAt, game?.status]);

  // Clear selection when game goes live
  useEffect(() => {
    if (game?.status === "live") setSelectedTickets([]);
  }, [game?.status]);

  // ── Game-start countdown + outro loop ───────────────────────────────
  const prevStatusRef = useRef(null);
  const outroTimerRef = useRef(null);

  useEffect(() => {
    const prev = prevStatusRef.current;
    const curr = game?.status ?? null;

    // Leaving "closed" — cancel pending outro + kill loop
    if (prev === "closed" && curr !== "closed") {
      clearTimeout(outroTimerRef.current);
      stopLoopingAudio();
    }

    // if (curr === "closed" && prev !== "closed" && prev !== null) {
    //   // Only set fallback if fullHouse wasn't already won
    //   // (if it was, the bingo onEnd callback handles the outro)
    //   const hasFullHouse = !!game?.winners?.fullHouse;
    //   if (!hasFullHouse) {
    //     outroTimerRef.current = setTimeout(() => {
    //       playAudioFileLooping("outro.wav");
    //     }, 8000);
    //   }
    // }

    prevStatusRef.current = curr;
    return () => clearTimeout(outroTimerRef.current);
  }, [game?.status]);



  // ── Announce newly called numbers ─────────────────────────────────────
  useEffect(() => {
    if (!game?.calledNumbers?.length) return;
    const prev = new Set(prevCalled.current);
    const newNums = game.calledNumbers.filter((n) => !prev.has(n));
    if (!newNums.length) return;

    prevCalled.current = game.calledNumbers;

    // If game just closed, chain outro as onEnd so it plays
    // only AFTER the last number finishes speaking
    if (game.status === "closed") {
      clearTimeout(outroTimerRef.current); // cancel the fallback timer
      announceNumber(newNums[newNums.length - 1], () => {
        playAudioFileLooping("outro.wav");
      });
      return;
    }

    announceNumber(newNums[newNums.length - 1]);
  }, [game?.calledNumbers, game?.status]);


  // ── Winner toast + sound — watches winners independently ─────────────
  useEffect(() => {
    if (!game) {
      prevWinnersRef.current = null;
      return;
    }

    const currentWinners = game.winners || {};
    const prevWinners = prevWinnersRef.current || {};

    const winLabels = {
      topLine: "the Top Line",
      middleLine: "the Middle Line",
      lastLine: "the Last Line",
      quickSeven: "Quick 7",
      fullHouse: "a Full House",
    };

    // Collect ALL changed types
    const changedTypes = [];
    for (const type of Object.keys(currentWinners)) {
      const curr = Array.isArray(currentWinners[type])
        ? currentWinners[type]
        : currentWinners[type] ? [currentWinners[type]] : [];
      const prev = Array.isArray(prevWinners[type])
        ? prevWinners[type]
        : prevWinners[type] ? [prevWinners[type]] : [];
      if (curr.length > prev.length) changedTypes.push(type);
    }

    prevWinnersRef.current = currentWinners;

    if (!changedTypes.length) return;
    if (game.status === "closed") return;

    // If fullHouse is among the winners (even alongside others), play bingo
    // if (changedTypes.includes("fullHouse")) {
    //  playAudioFilePriority("bingo.mp3");
    // } else {
    //   playAudioFile("winner-lines.wav");
    // }

    if (changedTypes.includes("fullHouse")) {
        playAudioFilePriority("bingo.mp3", () => {
          playAudioFileLooping("outro.wav");
        });
      } else {
        playAudioFile("winner-lines.wav");
      }

      // Show toast — prioritise fullHouse if it's among the changed types
      const toastType = changedTypes.includes("fullHouse") ? "fullHouse" : changedTypes[0];
      const w = currentWinners[toastType];
      const winners = Array.isArray(w) ? w : w ? [w] : [];

      if (winners.length) {
        const label = winLabels[toastType] || toastType;
        const names = winners.map((w) => w.userName).join(" & ");
        setToast({ id: Date.now(), user: names, label, tied: winners.length > 1 });
        setTimeout(() => setToast(null), 10000);
      }

  }, [game?.winners]);



  // ── Ticket selection helpers ──────────────────────────────────────────
  function toggleTicketSelect(ticketId) {
    setSelectedTickets(prev =>
      prev.includes(ticketId) ? prev.filter(id => id !== ticketId) : [...prev, ticketId]
    );
  }
  function clearSelection() { setSelectedTickets([]); }

 const whatsappHref = selectedTickets.length
  ? buildWhatsAppLink(selectedTickets, adminPhone)
  : null;

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ── Derived values ────────────────────────────────────────────────────
  const ticketList = Object.values(tickets).sort((a, b) =>
    parseInt(a.id.slice(1)) - parseInt(b.id.slice(1))
  );
  const freeCount = ticketList.filter(t => t.status === "free").length;
  const bookedCount = ticketList.filter(t => t.status === "booked").length;

  const activeFilter = game?.status === "live" ? "booked" : filter;
  const filtered = ticketList.filter((t) => {
    if (activeFilter === "free" && t.status !== "free") return false;
    if (activeFilter === "booked" && t.status !== "booked") return false;
    if (search &&
      !t.id.toLowerCase().includes(search.toLowerCase()) &&
      !(t.userName || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const STATUS_MAP = {
    waiting: { label: "Game starting soon", cls: "status-waiting" },
    live: { label: "🔴 LIVE", cls: "status-live" },
    closed: { label: "Game over", cls: "status-closed" },
  };
  const status = STATUS_MAP[game?.status] || STATUS_MAP.waiting;

  function chunkArray(arr, size) {
    const result = [];
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
    return result;
  }
  const ticketSheets = chunkArray(filtered, 6);


  useEffect(() => {
    preloadAudio(); // silently loads all 90 in background
  }, []);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="page">
      {/* Floating Winner Toast */}
      {toast && (
        <div key={toast.id} className="winner-toast">
          <div className="toast-content">
            <span className="toast-icon">🎉</span>
            <span className="toast-message">
              {toast.tied
                ? <>It's a tie! <strong>{toast.user}</strong> both completed {toast.label}!</>
                : <>Congratulations <strong>{toast.user}</strong>! You have completed {toast.label}.</>
              }
            </span>
          </div>
        </div>
      )}

      <header className="site-header">
        <div className="header-content">
          <div>
            <h1 className="site-title">TAMBOLA</h1>
            {/* <p className="site-subtitle">
              {gameId ? `Daily Housie — ${formatGameId(gameId)}` : "Daily Housie"}
            </p> */}
            {game && <div className={`game-status ${status.cls}`}>{status.label}</div>}
          </div>

          {/* Hamburger (both mobile & desktop) */}
          <button
            className="hamburger"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            <span /><span /><span />
          </button>
        </div>

        {/* Generic Dropdown */}
        {menuOpen && (
          <>
            <div
              onClick={() => setMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            />
            <nav className="dropdown-menu" onClick={() => setMenuOpen(false)}>
              <button className="dropdown-link" onClick={() => setActiveModal('rules')}>📋 Rules</button>
              <button className="dropdown-link" onClick={() => setActiveModal('winners')}>🏆 Past Winners</button>
              <button className="dropdown-link" onClick={() => setActiveModal('bookings')}>🎟️ Booking List</button>
            </nav>
          </>
        )}
      </header>

      <div>
        <img className="tambola-banner" src="/assets/banner.webp" alt="Welcome to Housie" />
      </div>

      {/* Scheduled countdown banner */}
      {game?.scheduledAt && game?.status === "waiting" && countdown && (
        <div className="public-countdown-bar">
          <span className="pub-cd-label">
            Today's game starts at <strong>{formatTime(game.scheduledAt)}</strong>
          </span>
          <div className="pub-cd-timer">
            <span className="pub-cd-digits">{countdown}</span>
            <span className="pub-cd-sub">until game starts</span>
          </div>
        </div>
      )}

      {/* Floating multi-select booking bar */}
      {selectedTickets.length > 0 && (
        <div className="booking-bar">
          <div className="booking-bar-info">
            <span className="booking-bar-count">
              {selectedTickets.length} ticket{selectedTickets.length > 1 ? "s" : ""} selected
            </span>
            <span className="booking-bar-ids">{selectedTickets.join(", ")}</span>
          </div>
          <div className="booking-bar-actions">
            <button onClick={clearSelection} className="booking-bar-clear">✕ Clear</button>
            <a href={whatsappHref} target="_blank" rel="noreferrer" className="booking-bar-wa">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Book via WhatsApp
            </a>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      {loading ? (
        <div className="loading">Loading game…</div>
      ) : !gameId || !game ? (
        <div className="loading">No game active right now. Check back soon!</div>
      ) : game.status === "closed" ? (
        // <main className="victory-screen">
        //   <div className="victory-content">

        //     {/* ── Game Winners ── */}
        //     {[
        //       { key: 'fullHouse', title: 'FULL HOUSE!', emoji: '🎉🎊🏆🎊🎉', label: 'Full House Winner' },
        //       { key: 'topLine', title: 'TOP LINE', emoji: '🎯', label: 'Top Line Winner' },
        //       { key: 'middleLine', title: 'MIDDLE LINE', emoji: '🎯', label: 'Middle Line Winner' },
        //       { key: 'lastLine', title: 'LAST LINE', emoji: '🎯', label: 'Last Line Winner' },
        //       { key: 'quickSeven', title: 'QUICK 7', emoji: '⚡', label: 'Quick 7 Winner' },
        //     ].map(({ key, title, emoji, label }) => {
        //       const categoryWinners = game?.winners?.[key]
        //         ? Array.isArray(game.winners[key]) ? game.winners[key] : [game.winners[key]]
        //         : [];
        //       if (categoryWinners.length === 0) return null;
              
        //       return (
        //         <div key={key} className="victory-section" style={{ marginTop: key === 'fullHouse' ? '0' : '40px' }}>
        //           <div className="victory-emoji" style={{ fontSize: key === 'fullHouse' ? '2.5rem' : '2rem' }}>{emoji}</div>
        //           <h2 className="victory-title" style={{ fontSize: key === 'fullHouse' ? '2rem' : '1.5rem', marginTop: '10px' }}>{title}</h2>
        //           {categoryWinners.map((winner, i) => (
        //             <div key={i} className="victory-winner-card" style={{ marginTop: '20px' }}>
        //               <p className="victory-label">
        //                 {categoryWinners.length > 1 ? `🏆 Winner ${i + 1}` : `Today's ${label}`}
        //               </p>
        //               <p className="victory-name">{winner.userName}</p>
        //               {/* Ticket display */}
        //               <WinnerTicketDisplay
        //                 ticket={tickets[winner.ticketId]}
        //                 calledNumbers={game.calledNumbers || []}
        //                 winType={key}
        //               />
        //             </div>
        //           ))}
        //         </div>
        //       );
        //     })}

        //     {/* ── Game over message ── */}
        //     <div className="victory-end-card">
        //       <h2 className="victory-end-title">Game Ended</h2>
        //       <p className="victory-end-msg">
        //         Bookings for the next game will start soon.<br />Be Ready!
        //       </p>
        //     </div>

        //     <button
        //       onClick={() => setActiveModal('winners')}
        //       className="admin-btn primary"
        //       style={{ marginTop: 24, display: "inline-block", padding: "12px 24px" }}
        //     >
        //       View All Past Winners
        //     </button>

        //   </div>
        // </main>

        <VictoryScreen
          game={game}
          tickets={tickets}
          setActiveModal={setActiveModal}
        />

      ) : (
        <main className="main-layout">
          <aside className="sidebar">
            <NumberBoard calledNumbers={game.calledNumbers || []} />
          </aside>

          <section className="tickets-section">


            {game?.rules && (
              <div className="active-rules-bar">
                <span className="active-rules-label">💡 Active prizes:</span>
                {["topLine", "middleLine", "lastLine", "quickSeven", "fullHouse"].map(r =>
                  game.rules[r] ? (
                    <span key={r} className="active-rule-chip">
                      {{ topLine: "🎯 Top Line", middleLine: "🎯 Middle Line", lastLine: "🎯 Last Line", quickSeven: "⚡ Quick 7", fullHouse: "🏆 Full House" }[r]}
                    </span>
                  ) : null
                )}
              </div>
            )}


            {/* Toolbar */}
            <div className="tickets-toolbar">
              <input
                className="search-input"
                placeholder="Search ticket ID or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {
                game?.status === "waiting" && (
                  <div className="filter-tabs">
                    {["all", "free", "booked"].map((f) => (
                      <button
                        key={f}
                        className={`filter-tab ${activeFilter === f ? "active" : ""}`}
                        onClick={() => setFilter(f)}
                        disabled={game?.status === "live"}
                      >
                        {f === "all" ? `All (${ticketList.length})` :
                          f === "free" ? `Available (${freeCount})` :
                            `Booked (${bookedCount})`}
                      </button>
                    ))}
                  </div>
                )
              }

            </div>


            {/* Ticket sheets */}
            <div className="tickets-sheets-container">
              {ticketSheets.map((sheet, sIdx) => (
                <div key={sIdx} className="ticket-sheet">
                  <h3 className="sheet-title">Sheet {sIdx + 1}</h3>
                  <div className="tickets-grid">
                    {sheet.map((ticket, tIdx) => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        calledNumbers={game.calledNumbers || []}
                        gameStatus={game.status}
                        colorIndex={tIdx}
                        selectable={game.status === "waiting" && ticket.status === "free"}
                        isSelected={selectedTickets.includes(ticket.id)}
                        onToggleSelect={toggleTicketSelect}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {ticketSheets.length === 0 && (
                <div className="no-tickets">No tickets found</div>
              )}
            </div>
          </section>
        </main>
      )}
      {/* Floating winners panel — visible during live game and after */}
      {game && game.status !== "waiting" && (
        <WinnersPanel winners={game.winners || {}} gameRules={game.rules || {}} />
      )}

      <DisclaimerModal />

      {/* Modals */}
      {activeModal === 'rules' && <RulesModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'winners' && <WinnersModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'bookings' && <BookingListModal tickets={tickets} onClose={() => setActiveModal(null)} />}
    </div>


  );
}

function WinnerTicketDisplay({ ticket, calledNumbers, winType }) {
  if (!ticket?.numbers) return null;

  const grid = Array.isArray(ticket.numbers[0])
    ? ticket.numbers
    : reconstructGrid(ticket.numbers);

  const called = new Set(calledNumbers);

  return (
    <div className="ticket-card booked live static-display ticket-color-0">
      {/* Header */}
      <div className="ticket-header">
        <span className="ticket-id">
          {ticket.id} <span className="ticket-badge booked-badge">Booked ✓</span>
        </span>
        <span className="ticket-owner">👤 {ticket.userName}</span>
      </div>

      {/* Number Grid */}
      <div className="ticket-grid">
        {grid.map((row, ri) => (
          <div key={ri} className="ticket-row">
            {row.map((num, ci) => (
              <div
                key={ci}
                className={`ticket-cell ${num === 0 || num === null ? "blank" :
                  called.has(num) ? "marked" : "active"
                  }`}
              >
                {num !== null && num !== 0 ? num : ""}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}




function VictoryScreen({ game, tickets, setActiveModal }) {
  const canvasRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    // ── Stars ──
    const starsLayer = document.getElementById('starsLayer');
    for (let i = 0; i < 80; i++) {
      const s = document.createElement('div');
      s.className = 'vs-star';
      const sz = Math.random() * 2.5 + 0.5;
      s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--d:${(Math.random()*3+1.5).toFixed(1)}s;animation-delay:${(Math.random()*4).toFixed(1)}s`;
      starsLayer.appendChild(s);
    }

    // ── Confetti ──
    const confettiLayer = document.getElementById('confettiLayer');
    const cfColors = ['#f5a623','#ff6b6b','#6bffce','#ce6bff','#6baeff','#fff56b'];
    const intervals = [];

    function spawnConfetti() {
      const c = document.createElement('div');
      c.className = 'vs-cf';
      const dur = (Math.random() * 3 + 2.5).toFixed(1);
      c.style.cssText = `left:${Math.random()*100}%;background:${cfColors[Math.floor(Math.random()*cfColors.length)]};width:${Math.random()*8+5}px;height:${Math.random()*8+5}px;border-radius:${Math.random()>0.5?'50%':'2px'};animation:vsCfFall ${dur}s 0s linear forwards`;
      confettiLayer.appendChild(c);
      setTimeout(() => c.remove(), parseFloat(dur) * 1000 + 200);
    }
    for (let i = 0; i < 55; i++) spawnConfetti();
    intervals.push(setInterval(spawnConfetti, 200));

    // ── Fireworks ──
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let W, H, animId;

    function resize() {
      const root = rootRef.current;
      if (!root) return;
      W = canvas.width = root.offsetWidth;
      H = canvas.height = root.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const PALETTE = ['#f5a623','#ff6b6b','#ff6bce','#6bffce','#6baeff','#ce6bff','#fff','#ffec6b','#6bff8e'];
    const fwList = [];

    function Firework(x, y) {
      this.color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      this.particles = [];
      const count = 55 + Math.floor(Math.random() * 35);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
        const speed = 1.8 + Math.random() * 4.5;
        this.particles.push({ x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed, life: 1, decay: 0.012 + Math.random()*0.016, size: 2 + Math.random()*2.5, trail: [] });
      }
    }
    Firework.prototype.update = function() {
      this.particles.forEach(p => {
        p.trail.push({x:p.x,y:p.y});
        if (p.trail.length > 5) p.trail.shift();
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.065; p.vx *= 0.97;
        p.life -= p.decay;
      });
      this.particles = this.particles.filter(p => p.life > 0);
    };
    Firework.prototype.draw = function() {
      this.particles.forEach(p => {
        ctx.save();
        for (let t = 0; t < p.trail.length - 1; t++) {
          ctx.beginPath();
          ctx.moveTo(p.trail[t].x, p.trail[t].y);
          ctx.lineTo(p.trail[t+1].x, p.trail[t+1].y);
          ctx.strokeStyle = this.color;
          ctx.globalAlpha = (t / p.trail.length) * p.life * 0.4;
          ctx.lineWidth = p.size * 0.5;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI*2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = p.life;
        ctx.fill();
        ctx.restore();
      });
    };
    Firework.prototype.done = function() { return this.particles.length === 0; };

    let lastLaunch = 0;
    function animate(ts) {
      animId = requestAnimationFrame(animate);
      ctx.fillStyle = 'rgba(10,8,22,0.18)';
      ctx.fillRect(0, 0, W, H);
      if (ts - lastLaunch > 380 + Math.random()*500) {
        const x = W*0.15 + Math.random()*W*0.7;
        const y = H*0.05 + Math.random()*H*0.55;
        fwList.push(new Firework(x, y));
        if (Math.random() > 0.55) fwList.push(new Firework(W*0.15 + Math.random()*W*0.7, H*0.05 + Math.random()*H*0.55));
        lastLaunch = ts;
      }
      for (let i = fwList.length - 1; i >= 0; i--) {
        fwList[i].update(); fwList[i].draw();
        if (fwList[i].done()) fwList.splice(i, 1);
      }
    }
    animId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
      intervals.forEach(clearInterval);
    };
  }, []);

  const categories = [
    { key: 'fullHouse', title: 'FULL HOUSE!', emoji: '🎉🏆🏆🎉', label: 'Full House Winner' },
    { key: 'topLine',   title: 'TOP LINE',    emoji: '🎯', label: 'Top Line Winner' },
    { key: 'middleLine',title: 'MIDDLE LINE', emoji: '🎯', label: 'Middle Line Winner' },
    { key: 'lastLine',  title: 'LAST LINE',   emoji: '🎯', label: 'Last Line Winner' },
    { key: 'quickSeven',title: 'QUICK 7',     emoji: '⚡', label: 'Quick 7 Winner' },
  ];

  return (
    <main className="vs-root" ref={rootRef}>
      <div className="vs-stars-layer" id="starsLayer" />
      <canvas ref={canvasRef} className="vs-canvas" />
      <div className="vs-confetti-layer" id="confettiLayer" />

      <div className="vs-content">

        {categories.map(({ key, title, emoji, label }, idx) => {
          const winners = game?.winners?.[key]
            ? Array.isArray(game.winners[key]) ? game.winners[key] : [game.winners[key]]
            : [];
          if (winners.length === 0) return null;

          const isFullHouse = key === 'fullHouse';

          return (
            <div key={key} className={`vs-section ${isFullHouse ? 'vs-fullhouse-section' : ''}`} style={{ animationDelay: `${idx * 0.1}s` }}>
              {isFullHouse && <span className="vs-trophy-emoji">{emoji}</span>}
              <h2 className={isFullHouse ? 'vs-full-title' : 'vs-line-title'}>
                {!isFullHouse && <span className="vs-line-emoji">{emoji}</span>}
                {title}
              </h2>

              {winners.map((winner, i) => (
                <div key={i} className="vs-winner-card">
                  <p className="vs-winner-label">
                    {winners.length > 1 ? `🏆 Winner ${i + 1}` : `Today's ${label}`}
                  </p>
                  <p className="vs-winner-name">{winner.userName}</p>
                  <WinnerTicketDisplay
                    ticket={tickets[winner.ticketId]}
                    calledNumbers={game.calledNumbers || []}
                    winType={key}
                  />
                </div>
              ))}
            </div>
          );
        })}

        <div className="vs-divider" />

        <div className="vs-end-card">
          <h2 className="vs-end-title">Game Ended</h2>
          <p className="vs-end-msg">
            Bookings for the next game will start soon.<br />Be Ready!
          </p>
        </div>

        <button className="vs-past-btn" onClick={() => setActiveModal('winners')}>
          View All Past Winners
        </button>

      </div>
    </main>
  );
}
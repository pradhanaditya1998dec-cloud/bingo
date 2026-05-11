"use client";
// app/admin/page.jsx
import { useEffect, useState, useRef, useCallback } from "react";
import {
  subscribeActiveGameId, subscribeGame, subscribeTickets,
  initTodayGame, initTickets, callNumber, setGameStatus,
  bookMultipleTickets, recordWinner, setScheduledTime,
  generateGameId, formatGameId,
  recordAllWinners,
  reopenGame,
} from "../lib/gameStore";
import { checkWinners, WIN_TYPES, WIN_LABELS, announceNumber } from "../lib/tambola";
import { auth } from "../lib/firebase";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import NumberBoard from "../components/NumberBoard";
import BookTicket from "../components/BookTicket";
import BookingsTable from "../components/BookingsTable";
import PastWinnersTable from "../components/PastWinnersTable";
import ConfirmModal from "../components/ConfirmModal";
import NewGameModal from "../components/NewGameModal";
import Toast, { useToast } from "../components/Toast";
import { playWinnerSound } from "../lib/audioManager";

// ── Nav config ────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    label: "Game",
    items: [{ id: "game", label: "Game Dashboard", icon: <IconGrid /> }],
  },
  {
    label: "Tickets",
    items: [
      { id: "book", label: "Book Ticket", icon: <IconTicket /> },
      { id: "bookings", label: "All Bookings", icon: <IconList />, badge: true },
    ],
  },
  {
    label: "Results",
    items: [
      { id: "past", label: "Past Games", icon: <IconHistory /> },
    ],
  },
];

// ── Icons ─────────────────────────────────────────────────
function IconGrid() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
}
function IconTicket() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a2 2 0 010-4h20a2 2 0 010 4v1a2 2 0 000 4v1a2 2 0 01-2 2H4a2 2 0 01-2-2v-1a2 2 0 000-4V9z" /></svg>;
}
function IconList() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></svg>;
}
function IconHistory() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
}
function IconChevronLeft() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>;
}
function IconMenu() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>;
}
function IconSignOut() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 13, height: 13 }}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>;
}

// ── Main component ────────────────────────────────────────
export default function AdminPage() {
  const { toasts, removeToast, success, error: toastError, info } = useToast();

  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [game, setGame] = useState(null);
  const [tickets, setTickets] = useState({});
  const [gameId, setGameId] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Modals
  const [newGameModalOpen, setNewGameModalOpen] = useState(false);
  const [modal, setModal] = useState({ open: false });

  // Auto-draw
  const [autoDrawEnabled, setAutoDrawEnabled] = useState(false);
  const [autoDrawInterval, setAutoDrawInterval] = useState(8);
  const [autoCountdown, setAutoCountdown] = useState(0);
  const autoDrawRef = useRef(null);
  const autoCountdownRef = useRef(null);

  // Schedule
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleMsg, setScheduleMsg] = useState("");
  const [scheduleCountdown, setScheduleCountdown] = useState("");
  const scheduleTimerRef = useRef(null);

  // Sidebar
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState("game");

  const calledSet = useRef(new Set());
  const gameRef = useRef(null);
  const unsubGame = useRef(null);
  const unsubTix = useRef(null);

  // ── Auth ─────────────────────────────────────────────────
  useEffect(() => { return onAuthStateChanged(auth, setUser); }, []);

  useEffect(() => {
    if (!user) return;
    return subscribeActiveGameId(id => setGameId(prev => prev ?? id));
  }, [user]);

  useEffect(() => {
    unsubGame.current?.(); unsubTix.current?.();
    if (!user || !gameId) return;
    unsubGame.current = subscribeGame(gameId, g => { setGame(g); gameRef.current = g; });
    unsubTix.current = subscribeTickets(gameId, t => setTickets(t));
    return () => { unsubGame.current?.(); unsubTix.current?.(); };
  }, [user, gameId]);

  useEffect(() => { calledSet.current = new Set(game?.calledNumbers || []); }, [game?.calledNumbers]);


  // ── Winner detection ──────────────────────────────────────
  useEffect(() => {
    if (!game?.calledNumbers?.length || !Object.keys(tickets).length) return;
    const rules = game.rules || { topLine: true, middleLine: true, lastLine: true, quickSeven: true, fullHouse: true };

    async function detectWinners() {
      const bookedTickets = Object.values(tickets).filter(t => t.status === "booked");

      for (const type of WIN_TYPES) {
        if (!rules[type]) continue;
        if (game.winners?.[type]) continue; // already recorded, skip

        // Collect ALL tickets that won this type simultaneously
        const winners = bookedTickets.filter(ticket => {
          const wins = checkWinners(ticket.numbers, game.calledNumbers);
          return wins[type];
        });

        if (winners.length === 0) continue;

        // Write all tied winners in one Firestore call
        await recordAllWinners(gameId, type, winners.map(t => ({
          ticketId: t.id,
          userName: t.userName,
          userPhone: t.userPhone || null,
          claimedAt: Date.now(),
        })));

        // Play winner.wav simultaneously with any ongoing number announcement
        playWinnerSound();

        // Toast for each winner
        winners.forEach(t => success(`🎉 ${WIN_LABELS[type]}: ${t.userName} (${t.id})`));

        if (type === "fullHouse") {
          stopAutoDraw();
          await setGameStatus(gameId, "closed");
          const names = winners.map(t => t.userName).join(", ");
          success(`🏆 GAME OVER! Full House: ${names}!`);
        }
      }
    }

    detectWinners();
  }, [game?.calledNumbers?.length]);

  // ── Schedule countdown + auto-start ──────────────────────
  useEffect(() => {
    if (scheduleTimerRef.current) clearInterval(scheduleTimerRef.current);
    if (!game?.scheduledAt || game.status !== "waiting") { setScheduleCountdown(""); return; }
    function tick() {
      const diff = game.scheduledAt - Date.now();
      if (diff <= 0) {
        clearInterval(scheduleTimerRef.current);
        setScheduleCountdown("Starting…");
        setGameStatus(gameId, "live").catch(console.error);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const parts = [];
      if (h > 0) parts.push(`${h}h`);
      if (m > 0 || h > 0) parts.push(`${m}m`);
      parts.push(`${s}s`);
      setScheduleCountdown(parts.join(" "));
    }
    tick();
    scheduleTimerRef.current = setInterval(tick, 1000);
    return () => clearInterval(scheduleTimerRef.current);
  }, [game?.scheduledAt, game?.status, gameId]);

  // Stop auto-draw whenever the game is no longer live
  useEffect(() => { if (game?.status !== "live") stopAutoDraw(); }, [game?.status]);

  // ── Draw ──────────────────────────────────────────────────
  const drawOne = useCallback(async (specificNumber = null) => {
    const g = gameRef.current;
    if (!g || g.status !== "live") return;
    let num;
    if (specificNumber !== null) {
      if (calledSet.current.has(specificNumber)) return;
      num = specificNumber;
    } else {
      const rem = [];
      for (let n = 1; n <= 90; n++) if (!calledSet.current.has(n)) rem.push(n);
      if (!rem.length) { info("All 90 numbers called!"); stopAutoDraw(); return; }
      num = rem[Math.floor(Math.random() * rem.length)];
    }
    setDrawing(true);
    await callNumber(gameId, num);
    announceNumber(num);
    setDrawing(false);
  }, [gameId]);

  function startAutoDraw() {
    if (autoDrawRef.current) return;
    setAutoDrawEnabled(true);
    setAutoCountdown(autoDrawInterval);
    autoCountdownRef.current = setInterval(() =>
      setAutoCountdown(p => p <= 1 ? autoDrawInterval : p - 1), 1000);
    autoDrawRef.current = setInterval(() => drawOne(), autoDrawInterval * 1000);
    drawOne();
  }

  function stopAutoDraw() {
    clearInterval(autoDrawRef.current); autoDrawRef.current = null;
    clearInterval(autoCountdownRef.current); autoCountdownRef.current = null;
    setAutoDrawEnabled(false); setAutoCountdown(0);
  }

  // ── Init — from NewGameModal ──────────────────────────────
  async function handleInit({ ticketCount, sheetSize, rules }) {
    stopAutoDraw();
    setGenerating(true);
    setNewGameModalOpen(false);
    try {
      const newId = generateGameId();
      await initTodayGame(newId, rules);
      await initTickets(newId, ticketCount, sheetSize);
      // Reset local state so old game data is fully cleared
      setGameId(newId);
      setGame(null);
      setTickets({});
      const ruleNames = Object.entries(rules)
        .filter(([, v]) => v)
        .map(([k]) => ({ topLine: "Top", middleLine: "Middle", lastLine: "Last", fullHouse: "Full House" }[k]))
        .join(", ");
      success(`✅ Game created! ${ticketCount} tickets · Prizes: ${ruleNames}`);
    } catch (e) { toastError("Init failed: " + e.message); }
    finally { setGenerating(false); }
  }

  // ── End game confirm ──────────────────────────────────────
  function confirmEndGame() {
    setModal({
      open: true,
      title: "End Game?",
      message: "This will close the game permanently. Winners will be locked. Are you sure?",
      confirmLabel: "Yes, End Game",
      danger: true,
      onConfirm: async () => {
        setModal(m => ({ ...m, open: false }));
        stopAutoDraw();
        await setGameStatus(gameId, "closed");
        success("Game ended.");
      },
    });
  }

  // ── Schedule ──────────────────────────────────────────────
  async function handleSetSchedule() {
    setScheduleMsg("");
    if (!scheduleTime) { setScheduleMsg("Please pick a time."); return; }
    const [h, m] = scheduleTime.split(":").map(Number);
    const target = new Date(); target.setHours(h, m, 0, 0);
    if (target.getTime() <= Date.now()) { setScheduleMsg("That time has already passed."); return; }
    await setScheduledTime(gameId, target.getTime());
    setScheduleMsg(`✓ Scheduled for ${formatTime(target.getTime())}`);
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  async function handleLogin(e) {
    e.preventDefault(); setAuthError("");
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch { setAuthError("Invalid credentials."); }
  }

  function confirmReopenGame() {
  setModal({
    open: true,
    title: "Reopen Game?",
    message: "This will reopen the game. All booked tickets and player info are still intact.",
    confirmLabel: "Yes, Reopen",
    danger: false,
    onConfirm: async () => {
      setModal(m => ({ ...m, open: false }));
      await reopenGame(gameId);
      success("Game reopened.");
    },
  });
}

  const ticketList = Object.values(tickets).sort((a, b) => a.id.localeCompare(b.id));
  const freeTickets = ticketList.filter(t => t.status === "free");
  const bookedTickets = ticketList.filter(t => t.status === "booked");
  const calledArr = game?.calledNumbers || [];

  // BUG FIX 1: "New Game / Reset" must be disabled unless the game is
  // closed (ended) OR there is no game at all yet.
  // Previously: only `generating` was checked, so it was clickable mid-game.
  const canCreateNewGame = !generating && (!game || game.status === "closed");

  // BUG FIX 2: The NumberBoard receives `calledNumbers` from `game` via
  // Firestore. When a new game is created, `setGame(null)` is called
  // immediately, which drives `calledArr` to [] — so the board resets
  // automatically once the new game's Firestore subscription fires.
  // The fix is ensuring we pass [] (not stale data) when game is null.
  // `calledArr` already handles this: `game?.calledNumbers || []`.
  // Additionally, we key the NumberBoard on gameId so React fully
  // remounts it whenever a new game starts, clearing any internal state.

  // ── Login screen ──────────────────────────────────────────
  if (!user) {
    return (
      <div className="admin-login">
        <div className="login-card">
          <h1>Admin Login</h1>
          <p>Tambola Game Console</p>
          <form onSubmit={handleLogin}>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="admin-input" required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="admin-input" required />
            {authError && <p className="error-msg">{authError}</p>}
            <button type="submit" className="admin-btn primary">Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  // ── Admin shell ───────────────────────────────────────────
  return (
    <div className="admin-page">

      {/* ── Vertical Sidebar ── */}
      <nav className={`admin-sidenav ${navCollapsed ? "collapsed" : ""} ${mobileNavOpen ? "mobile-open" : ""}`}>

        <div className="nav-brand">
          <div className="nav-logo">T</div>
          <div className="nav-brand-text">
            <div className="nav-brand-title">Tambola</div>
            <div className="nav-brand-sub">Admin Console</div>
          </div>
        </div>

        {NAV_SECTIONS.map(section => (
          <div className="nav-section" key={section.label}>
            <div className="nav-section-label">{section.label}</div>
            {section.items.map(item => (
              <div
                key={item.id}
                className={`nav-item ${activeRoute === item.id ? "active" : ""}`}
                onClick={() => { setActiveRoute(item.id); setMobileNavOpen(false); }}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {item.badge && bookedTickets.length > 0 && (
                  <span className="nav-badge">{bookedTickets.length}</span>
                )}
                <span className="nav-tooltip">{item.label}</span>
              </div>
            ))}
          </div>
        ))}

        <div className="nav-divider" />

        <div className="nav-footer">
          <div className="nav-user">
            <div className="nav-avatar">{user.email?.[0]?.toUpperCase() ?? "A"}</div>
            <div className="nav-user-info">
              <div className="nav-user-name">{user.email}</div>
              <div className="nav-user-role">Super Admin</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="nav-toggle" onClick={() => signOut(auth)} title="Sign out" style={{ flex: 1 }}>
              <IconSignOut />
              <span className="nav-toggle-label">Sign Out</span>
            </button>
            <button
              className="nav-toggle"
              onClick={() => setNavCollapsed(c => !c)}
              title={navCollapsed ? "Expand" : "Collapse"}
              style={{ width: navCollapsed ? undefined : 34, padding: "0 8px", flex: navCollapsed ? 1 : "none" }}
            >
              <IconChevronLeft />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile backdrop */}
      {mobileNavOpen && <div className="nav-backdrop" onClick={() => setMobileNavOpen(false)} />}

      {/* ── Body ── */}
      <div className="admin-body">

        {/* Topbar */}
        <div className="admin-topbar">
          <div className="admin-topbar-left">
            <button className="nav-mobile-toggle" onClick={() => setMobileNavOpen(o => !o)}>
              <IconMenu />
            </button>
            <div>
              <div className="admin-topbar-title">
                {NAV_SECTIONS.flatMap(s => s.items).find(i => i.id === activeRoute)?.label ?? "Tambola Admin"}
              </div>
              <div className="admin-topbar-date">
                {gameId ? formatGameId(gameId) : "No active game"}
              </div>
            </div>
          </div>
          <div className="admin-topbar-right">
            <span className="topbar-stat">
              Status: <strong className={game?.status === "live" ? "stat-live" : ""}>{game?.status || "—"}</strong>
            </span>
            <span className="topbar-stat">Called: <strong>{calledArr.length}</strong>/90</span>
          </div>
        </div>

        {/* Toasts + Modals */}
        <Toast toasts={toasts} onRemove={removeToast} />

        <ConfirmModal
          open={modal.open}
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          danger={modal.danger}
          onConfirm={modal.onConfirm}
          onCancel={() => setModal(m => ({ ...m, open: false }))}
        />

        <NewGameModal
          open={newGameModalOpen}
          onConfirm={handleInit}
          onCancel={() => setNewGameModalOpen(false)}
        />

        {/* Content */}
        <div className="admin-content-wrap">
          <div className="admin-content">
            <div className="admin-layout">

              {/* ── GAME DASHBOARD ── */}
              {activeRoute === "game" && (<>

                {/* Game Controls */}
                <section className="admin-card">
                  <h2>Game Controls</h2>

                  {/* Active rules badge */}
                  {game?.rules && (
                    <div className="active-rules-bar">
                      <span className="active-rules-label">Active prizes:</span>
                      {/* {["topLine","middleLine","lastLine","fullHouse"].map(r =>
                        game.rules[r] ? (
                          <span key={r} className="active-rule-chip">
                            {{ topLine:"Top Line", middleLine:"Middle Line", lastLine:"Last Line", fullHouse:"Full House" }[r]}
                          </span>
                        ) : null
                      )} */}
                      {["topLine", "middleLine", "lastLine", "quickSeven", "fullHouse"].map(r =>
                        game.rules[r] ? (
                          <span key={r} className="active-rule-chip">
                            {{ topLine: "🎯 Top Line", middleLine: "🎯 Middle Line", lastLine: "🎯 Last Line", quickSeven: "⚡ Quick 7", fullHouse: "🏆 Full House" }[r]}
                          </span>
                        ) : null
                      )}
                    </div>
                  )}

                  <div className="control-row">
                    {/*
                      BUG FIX 1: disabled when game is waiting or live.
                      Only enabled when there is no game yet OR the game is closed.
                      Tooltip explains why it's locked.
                    */}
                    <button
                      onClick={() => setNewGameModalOpen(true)}
                      disabled={!canCreateNewGame}
                      title={
                        game?.status === "live" ? "End the game first before creating a new one" :
                          game?.status === "waiting" ? "End the game first before creating a new one" :
                            undefined
                      }
                      className="admin-btn outline"
                    >
                      {generating ? "⏳ Generating…" : "⚙️ New Game / Reset"}
                    </button>

                    <button
                      onClick={() => setGameStatus(gameId, "live")}
                      disabled={!gameId || game?.status === "live" || game?.status === "closed"}
                      className="admin-btn primary"
                    >
                      ▶ Start
                    </button>

                    <button
                      onClick={confirmEndGame}
                      disabled={!gameId || game?.status === "closed"}
                      className="admin-btn danger"
                    >
                      ⏹ End
                    </button>

                    <button
                      onClick={confirmReopenGame}
                      disabled={!gameId || game?.status !== "closed"}
                      className="admin-btn"
                    >
                      🔄 Reopen
                    </button>
                  </div>

                  {/*
                    Helper text when New Game is locked so admin knows exactly what to do.
                  */}
                  {game?.status === "live" && (
                    <p className="hint" style={{ color: "var(--accent2)", marginBottom: 10 }}>
                      ⚠️ End the current game before creating a new one.
                    </p>
                  )}
                  {game?.status === "waiting" && (
                    <p className="hint" style={{ marginBottom: 10 }}>
                      Game is scheduled. Start or end it before creating a new one.
                    </p>
                  )}

                  <div className="status-bar">
                    Status: <strong>{game?.status || "—"}</strong>
                    &nbsp;|&nbsp; Called: <strong>{calledArr.length} / 90</strong>
                    &nbsp;|&nbsp; Remaining: <strong>{90 - calledArr.length}</strong>
                    &nbsp;|&nbsp; Booked: <strong>{bookedTickets.length} / {ticketList.length}</strong>
                  </div>

                  <button
                    onClick={() => { stopAutoDraw(); drawOne(); }}
                    disabled={drawing || game?.status !== "live" || autoDrawEnabled}
                    className="draw-btn"
                  >
                    {drawing ? "Drawing…" : "🎱 Draw Next Number"}
                  </button>

                  {/* Auto-draw */}
                  <div className="autodraw-section">
                    <div className="autodraw-header">
                      <span className="autodraw-label">Auto Draw</span>
                      {autoDrawEnabled && <span className="autodraw-countdown">Next in {autoCountdown}s</span>}
                    </div>
                    <div className="autodraw-controls">
                      <div className="interval-control">
                        <label>Every</label>
                        <input type="number" min="2" max="30" value={autoDrawInterval}
                          onChange={e => setAutoDrawInterval(Math.max(2, parseInt(e.target.value) || 8))}
                          disabled={autoDrawEnabled} className="interval-input" />
                        <label>seconds</label>
                      </div>
                      {autoDrawEnabled
                        ? <button onClick={stopAutoDraw} className="admin-btn danger">⏸ Stop Auto</button>
                        : <button onClick={startAutoDraw} disabled={game?.status !== "live"} className="admin-btn primary">▶ Start Auto</button>
                      }
                    </div>
                    {autoDrawEnabled && (
                      <div className="autodraw-active-bar">
                        <div className="autodraw-progress" style={{ animationDuration: `${autoDrawInterval}s` }} />
                      </div>
                    )}
                  </div>

                  {calledArr.length > 0 && (
                    <div className="called-numbers-mini">
                      <strong>Called ({calledArr.length}):</strong>
                      <div className="called-chips">
                        {[...calledArr].reverse().map(n => <span key={n} className="chip">{n}</span>)}
                      </div>
                    </div>
                  )}
                </section>

                {/* Schedule */}
                <section className="admin-card">
                  <h2>Schedule Start</h2>
                  <p className="hint">Game auto-starts at the set time. Players see a live countdown.</p>

                  {game?.scheduledAt && game.status === "waiting" && (
                    <div className="schedule-banner">
                      <div className="schedule-banner-left">
                        <span className="schedule-label">Scheduled for</span>
                        <span className="schedule-time">{formatTime(game.scheduledAt)}</span>
                      </div>
                      {scheduleCountdown && (
                        <div className="countdown-badge">
                          <span className="countdown-label">Starts in</span>
                          <span className="countdown-value">{scheduleCountdown}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {game?.status === "live" && <div className="schedule-live-note">✅ Game is now live.</div>}
                  {game?.status === "closed" && <div className="schedule-live-note">Game has ended.</div>}

                  {(!game?.status || game.status === "waiting") && (
                    <div className="schedule-form">
                      <div className="schedule-input-row">
                        <input type="time" className="admin-input time-input" value={scheduleTime}
                          onChange={e => setScheduleTime(e.target.value)} />
                        <button onClick={handleSetSchedule} className="admin-btn primary">Set</button>
                        {game?.scheduledAt && (
                          <button onClick={async () => {
                            await setScheduledTime(gameId, null);
                            setScheduleMsg("Cleared."); setScheduleTime("");
                          }} className="admin-btn outline">Clear</button>
                        )}
                      </div>
                      {scheduleMsg && (
                        <p className={scheduleMsg.startsWith("✓") ? "success-msg" : "error-msg"}>{scheduleMsg}</p>
                      )}
                    </div>
                  )}
                </section>

                {/* Number Board
                  BUG FIX 2: key={gameId} forces React to fully unmount + remount
                  the NumberBoard whenever a new game is created, so any internal
                  highlighted/selected state is wiped clean.
                  The calledNumbers prop already resets to [] because game is set to
                  null on new game creation, but the key ensures even internal
                  component state (e.g. hover, last-called highlight) is also cleared.
                */}
                <section className="admin-card admin-board-card">
                  <h2>Number Board — Click to Call</h2>
                  <p className="hint">
                    {game?.status === "live"
                      ? "Click any uncalled number to call it manually"
                      : game?.status === "closed"
                        ? "Game ended — create a new game to play again"
                        : "Start the game to enable manual number selection"}
                  </p>
                  <NumberBoard
                    key={gameId ?? "empty"}
                    calledNumbers={calledArr}
                    interactive={game?.status === "live" && !autoDrawEnabled}
                    onPickNumber={n => { stopAutoDraw(); drawOne(n); }}
                  />
                </section>

              </>)}

              {/* ── BOOK TICKET ── */}
              {activeRoute === "book" && (
                <section className="admin-card" style={{ gridColumn: "1 / -1" }}>
                  <h2>Book Ticket</h2>
                  <div style={{ marginTop: 16 }}>
                    <BookTicket
                      gameId={gameId}
                      freeTickets={freeTickets}
                      bookedTickets={bookedTickets}
                      gameStatus={game?.status}
                      onBooked={msg => success(msg)}
                    />
                  </div>
                </section>
              )}

              {/* ── ALL BOOKINGS ── */}
              {activeRoute === "bookings" && (
                <section className="admin-card" style={{ gridColumn: "1 / -1" }}>
                  <h2 style={{ marginBottom: 20 }}>All Bookings</h2>
                  <BookingsTable
                    currentGameId={gameId}
                    gameStatus={game?.status}
                  />
                </section>
              )}

              {/* ── PAST GAMES ── */}
              {activeRoute === "past" && (
                <section className="admin-card" style={{ gridColumn: "1 / -1" }}>
                  <h2 style={{ marginBottom: 20 }}>Past Games</h2>
                  <PastWinnersTable />
                </section>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
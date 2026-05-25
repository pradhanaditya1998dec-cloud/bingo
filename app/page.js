"use client";
// app/page.jsx
import { useEffect, useState, useRef } from "react";
import {
  subscribeActiveGameId,
  subscribeGame,
  subscribeTickets,
  buildWhatsAppLink,
  subscribeAdminSettings,
  bookTicketsWithTransaction,
} from "./lib/gameStore";
import { formatGameId, reconstructGrid } from "./lib/tambola";
import { announceNumber, preloadAudio, playAudioOverlay, playBlockingAudio, playBlockingAudioSequence, playAudioFileLooping, stopLoopingAudio } from "./lib/audioManager";
import TicketCard from "./components/TicketCard";
import NumberBoard from "./components/NumberBoard";
import WinnersPanel from "./components/WinnersPanel";
import DisclaimerModal from "./components/DisclaimerModal";
import RulesModal from "./components/RulesModal";
import WinnersModal from "./components/WinnersModal";
import BookingListModal from "./components/BookingListModal";

// const ADMIN_PHONE = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || "917628863362";

export default function GamePage() {
  const winnerAudioByType = {
    topLine: "top-line.mp3",
    middleLine: "middle-line.mp3",
    lastLine: "bottom-line.mp3",
    corners: "corners.mp3",
    quickSeven: "quick-7.mp3",
    fullHouse: "bingo.mp3",
    secondFullHouse: "bingo.mp3",
  };

  // ── Active game ID — driven by Firestore meta pointer ──────────────────
  // This is the key fix: instead of computing a static gameId at render time,
  // we subscribe to games/_meta and re-subscribe to game+tickets whenever the
  // admin starts a new game. Users never need to refresh.
  const [gameId, setGameId] = useState(null);

  const [game, setGame] = useState(null);
  const [tickets, setTickets] = useState({});
  const [displayCalledNumbers, setDisplayCalledNumbers] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState("");
  const [selectedTickets, setSelectedTickets] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'rules' | 'winners' | null
  const [toast, setToast] = useState(null);
  const [showVictoryScreen, setShowVictoryScreen] = useState(true);

  const [bookingName, setBookingName] = useState("");
  const [isBooking, setIsBooking] = useState(false);
  const [nameError, setNameError] = useState(false);

  const countdownRef = useRef(null);
  const prevWinnersRef = useRef(null);
  const winnersHydratedRef = useRef(false);
  const prevCalled = useRef([]);
  const displayCalledRef = useRef([]);
  const isInitialLoad = useRef(true);
  const toastTimerRef = useRef(null);
  const announcementTimerRef = useRef(null);
  const pendingAnnouncementRef = useRef(null);
  const fullHouseAudioTimerRef = useRef(null);
  const fullHouseVictoryTimerRef = useRef(null);

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

  function showTimedToast(nextToast, duration = 10000) {
    clearTimeout(toastTimerRef.current);
    setToast(nextToast);
    toastTimerRef.current = setTimeout(() => setToast(null), duration);
  }

  function appendDisplayedCalledNumber(number) {
    if (number == null) return;
    if (displayCalledRef.current.includes(number)) return;

    const nextCalled = [...displayCalledRef.current, number];
    displayCalledRef.current = nextCalled;
    setDisplayCalledNumbers(nextCalled);
  }

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
    setDisplayCalledNumbers([]);
    displayCalledRef.current = [];
    setSelectedTickets([]);
    prevCalled.current = [];
    prevWinnersRef.current = null;
    winnersHydratedRef.current = false;
    isInitialLoad.current = true;
    setShowVictoryScreen(true);
    setLoading(true);

    unsubGameRef.current = subscribeGame(gameId, (data) => {
      if (isInitialLoad.current) {
        prevCalled.current = data?.calledNumbers || [];
        displayCalledRef.current = data?.calledNumbers || [];
        setDisplayCalledNumbers(data?.calledNumbers || []);
        prevWinnersRef.current = data?.winners || {};
        winnersHydratedRef.current = true;
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
  const isSecondFullHouseEnabled = !!game?.rules?.secondFullHouse;
  const hasClosingFullHouseWinner = isSecondFullHouseEnabled ? !!game?.winners?.secondFullHouse : !!game?.winners?.fullHouse;

  useEffect(() => {
    const prev = prevStatusRef.current;
    const curr = game?.status ?? null;

    // Leaving "closed" — cancel pending outro + kill loop
    if (prev === "closed" && curr !== "closed") {
      clearTimeout(outroTimerRef.current);
      clearTimeout(fullHouseAudioTimerRef.current);
      clearTimeout(fullHouseVictoryTimerRef.current);
      setShowVictoryScreen(true);
      stopLoopingAudio();
    }

    if (curr === "closed" && prev !== "closed") {
      if (hasClosingFullHouseWinner && prev !== null) {
        setShowVictoryScreen(false);
        clearTimeout(fullHouseVictoryTimerRef.current);
        fullHouseVictoryTimerRef.current = setTimeout(() => {
          setShowVictoryScreen(true);
        }, 5000);
      } else {
        setShowVictoryScreen(true);
      }
    }

    if (prev === "waiting" && curr === "live") {
      playBlockingAudio("game-start.mp3");
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
    return () => {
      clearTimeout(announcementTimerRef.current);
      pendingAnnouncementRef.current = null;
      clearTimeout(outroTimerRef.current);
      clearTimeout(fullHouseVictoryTimerRef.current);
    };
  }, [game?.status, hasClosingFullHouseWinner]);



  // ── Announce newly called numbers ─────────────────────────────────────
  useEffect(() => {
    if (!game?.calledNumbers?.length) return;
    const prev = new Set(prevCalled.current);
    const newNums = game.calledNumbers.filter((n) => !prev.has(n));
    if (!newNums.length) return;

    prevCalled.current = game.calledNumbers;

    // If game just closed, chain outro as onEnd so it plays
    // only AFTER the last number finishes speaking
    const latestNumber = newNums[newNums.length - 1];

    clearTimeout(announcementTimerRef.current);

    if (game.status !== "closed" && newNums.length > 1) {
      announcementTimerRef.current = null;
      pendingAnnouncementRef.current = null;
      const missingNumbers = newNums.filter((number) => !displayCalledRef.current.includes(number));
      missingNumbers.forEach((number) => appendDisplayedCalledNumber(number));
      newNums.forEach((number) => announceNumber(number));
      return;
    }

    if (game.status === "closed") {
      pendingAnnouncementRef.current = null;
      clearTimeout(outroTimerRef.current); // cancel the fallback timer
      if (hasClosingFullHouseWinner) {
        appendDisplayedCalledNumber(latestNumber);
        return;
      } else {
        appendDisplayedCalledNumber(latestNumber);
        announceNumber(latestNumber, () => {
          playAudioFileLooping("outro.wav");
        });
      }
      return;
    }

    pendingAnnouncementRef.current = latestNumber;
    announcementTimerRef.current = setTimeout(() => {
      announcementTimerRef.current = null;
      pendingAnnouncementRef.current = null;
      appendDisplayedCalledNumber(latestNumber);
      announceNumber(latestNumber);
    }, 900);
  }, [game?.calledNumbers, game?.status, hasClosingFullHouseWinner]);


  // ── Winner toast + sound — watches winners independently ─────────────
  useEffect(() => {
    if (!game) {
      prevWinnersRef.current = null;
      winnersHydratedRef.current = false;
      return;
    }

    const currentWinners = game.winners || {};
    const prevWinners = prevWinnersRef.current || {};

    if (!winnersHydratedRef.current) {
      prevWinnersRef.current = currentWinners;
      winnersHydratedRef.current = true;
      return;
    }

    const winLabels = {
      topLine: "the Top Line",
      middleLine: "the Middle Line",
      lastLine: "the Last Line",
      corners: "the Corners",
      quickSeven: "Quick 7",
      fullHouse: "a Full House",
      secondFullHouse: "the 2nd Full House",
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

    // If fullHouse is among the winners (even alongside others), play bingo
    // if (changedTypes.includes("fullHouse")) {
    //  playAudioFilePriority("bingo.mp3");
    // } else {
    //   playAudioFile("winner-lines.wav");
    // }

    const finalFullHouseTypes = changedTypes.filter(
      (type) => type === "secondFullHouse" || (type === "fullHouse" && !isSecondFullHouseEnabled)
    );
    const nonFinalFullHouseTypes = changedTypes.filter(
      (type) => type === "fullHouse" && isSecondFullHouseEnabled
    );
    const pendingNumber = pendingAnnouncementRef.current;
    const winningNumber = pendingNumber ?? game.calledNumbers?.[game.calledNumbers.length - 1] ?? null;
    let hasAnnouncedWinningNumber = false;

    if (pendingNumber !== null) {
      clearTimeout(announcementTimerRef.current);
      announcementTimerRef.current = null;
      pendingAnnouncementRef.current = null;
    }

    function announceWinningNumberOnce() {
      if (hasAnnouncedWinningNumber || winningNumber === null) return false;
      hasAnnouncedWinningNumber = true;
      playAudioOverlay("winner-lines.wav");
      appendDisplayedCalledNumber(winningNumber);
      announceNumber(winningNumber);
      return true;
    }

    const regularWinnerAudio = changedTypes
      .filter((type) => type !== "fullHouse" && type !== "secondFullHouse")
      .map((type) => winnerAudioByType[type])
      .filter(Boolean);

    if (regularWinnerAudio.length) {
      if (announceWinningNumberOnce()) {
        playBlockingAudioSequence(regularWinnerAudio);
      } else {
        playBlockingAudioSequence(regularWinnerAudio);
      }
    }

    if (nonFinalFullHouseTypes.length) {
      announceWinningNumberOnce();

      playBlockingAudioSequence(nonFinalFullHouseTypes.map((type) => winnerAudioByType[type]).filter(Boolean));
    }

    if (finalFullHouseTypes.length) {
      announceWinningNumberOnce();

      clearTimeout(fullHouseAudioTimerRef.current);
      fullHouseAudioTimerRef.current = setTimeout(() => {
        playBlockingAudio(winnerAudioByType[finalFullHouseTypes[0]], () => {
          playAudioFileLooping("outro.wav");
        });
      }, 5000);
    }

    // Show toast — prioritise fullHouse if it's among the changed types
    const toastEntries = changedTypes
      .map((type) => {
        const winnerData = currentWinners[type];
        const winners = Array.isArray(winnerData) ? winnerData : winnerData ? [winnerData] : [];
        if (!winners.length) return null;

        return {
          type,
          label: winLabels[type] || type,
          user: winners.map((winner) => winner.userName).join(" & "),
          tied: winners.length > 1,
        };
      })
      .filter(Boolean);

    if (toastEntries.length) {
      showTimedToast({
        id: Date.now(),
        entries: toastEntries,
        isFullHouse: toastEntries.some((entry) => entry.type === "fullHouse" || entry.type === "secondFullHouse"),
      });
    }

  }, [game?.winners, game?.calledNumbers, game?.status, isSecondFullHouseEnabled]);



  // ── Ticket selection helpers ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimeout(announcementTimerRef.current);
      pendingAnnouncementRef.current = null;
      clearTimeout(toastTimerRef.current);
      clearTimeout(fullHouseAudioTimerRef.current);
      clearTimeout(fullHouseVictoryTimerRef.current);
    };
  }, []);

  function toggleTicketSelect(ticketId) {
    setSelectedTickets(prev =>
      prev.includes(ticketId) ? prev.filter(id => id !== ticketId) : [...prev, ticketId]
    );
  }
  function clearSelection() { setSelectedTickets([]); }

  function openWhatsAppBooking(ticketIds, phone, userName) {
    const href = buildWhatsAppLink(ticketIds, phone, userName);
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

    if (isMobile) {
      window.location.href = href;
      return;
    }

    window.open(href, "_blank", "noopener,noreferrer");
  }

  // async function handleBookTickets() {
  //   if (!bookingName.trim()) {
  //     setNameError(true);
  //     setTimeout(() => setNameError(false), 500);
  //     return;
  //   }

  //   setIsBooking(true);
  //   try {
  //     const generatedNumber = "ID-" + Math.floor(100000 + Math.random() * 900000);
  //     const result = await bookTicketsWithTransaction(gameId, selectedTickets, {
  //       userName: bookingName.trim(),
  //       userPhone: generatedNumber
  //     });

  //     clearSelection();

  //     if (result.failed && result.failed.length > 0) {
  //       showTimedToast({
  //         id: Date.now(),
  //         user: "Partial Booking",
  //         label: `Ticket(s) ${result.booked.join(", ")} were successfully booked. However, ${result.failed.join(", ")} was taken by someone else just before you!`,
  //         isWarning: true
  //       }, 8000);
  //     } else {
  //       // Success
  //       showTimedToast({ id: Date.now(), user: "Success", label: "Tickets booked successfully!", isError: false }, 3000);
  //     }

  //     // Open WhatsApp with only the successfully booked tickets
  //     const finalWhatsappHref = buildWhatsAppLink(result.booked, adminPhone, bookingName.trim());
  //     if (finalWhatsappHref) {
  //       window.open(finalWhatsappHref, '_blank', 'noopener,noreferrer');
  //     }
  //   } catch (err) {
  //     console.error("Booking error:", err);

  //     if (err.code === "ALL_TICKETS_BOOKED") {
  //       // Every ticket in the selection was already taken
  //       showTimedToast({ id: Date.now(), user: "Oops!", label: "Someone was faster than you.. please select some other ticket.", isError: true }, 5000);
  //       clearSelection();
  //     } else {
  //       // Generic Firestore / network error — don't blame the user
  //       showTimedToast({ id: Date.now(), user: "Error", label: "Booking failed due to a connection issue. Please try again.", isError: true }, 5000);
  //       // Don't clear selection so they can retry the same tickets
  //     }
  //   } finally {
  //     setIsBooking(false);
  //   }
  // }

  async function handleBookTickets() {
  if (!bookingName.trim()) {
    setNameError(true);
    setTimeout(() => setNameError(false), 500);
    return;
  }

  setIsBooking(true);
  try {
    const generatedNumber = "ID-" + Math.floor(100000 + Math.random() * 900000);
    const result = await bookTicketsWithTransaction(gameId, selectedTickets, {
      userName: bookingName.trim(),
      userPhone: generatedNumber,
    });

    clearSelection();

    if (result.booked.length > 0) {
      openWhatsAppBooking(result.booked, adminPhone, bookingName.trim());
    }

    if (result.failed?.length > 0) {
      showTimedToast({
        id: Date.now(),
        user: "Partial Booking",
        label: `Ticket(s) ${result.booked.join(", ")} booked. ${result.failed.join(", ")} was already taken!`,
        isWarning: true,
      }, 8000);
    } else {
      showTimedToast({ id: Date.now(), user: "Success", label: "Tickets booked successfully!", isError: false }, 3000);
    }

  } catch (err) {
    console.error("Booking error:", err);

    if (err.code === "ALL_TICKETS_BOOKED") {
      showTimedToast({ id: Date.now(), user: "Oops!", label: "Someone was faster — please select another ticket.", isError: true }, 5000);
      clearSelection();
    } else if (err.code === "permission-denied") {
      showTimedToast({ id: Date.now(), user: "Database Error", label: "Booking permission denied. Please try again.", isError: true }, 6000);
    } else if (err.code === "aborted") {
      showTimedToast({ id: Date.now(), user: "System Busy", label: "High traffic — please try again.", isError: true }, 6000);
    } else {
      showTimedToast({ id: Date.now(), user: "Connection Error", label: `Booking failed: ${err.message || "connection issue"}. Please try again.`, isError: true }, 6000);
    }
  } finally {
    setIsBooking(false);
  }
}


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
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .input-error-shake {
          animation: shake 0.3s ease-in-out;
        }
      `}</style>

      {/* Floating Winner Toast */}
      {toast && (
        <div
          key={toast.id}
          className={`winner-toast${toast.isFullHouse ? " full-house-toast" : ""}`}
          style={
            toast.isError
              ? {
                background: 'linear-gradient(135deg, #ff5e62 0%, #ff9966 100%)',
                boxShadow: '0 10px 25px -5px rgba(255, 94, 98, 0.5)',
                border: '2px solid rgba(255,255,255,0.3)',
                color: '#fff',
                borderRadius: '16px',
                padding: '16px 24px',
                maxWidth: '400px'
              }
              : toast.isWarning
                ? {
                  background: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
                  boxShadow: '0 10px 25px -5px rgba(253, 160, 133, 0.5)',
                  border: '2px solid rgba(255,255,255,0.3)',
                  color: '#fff',
                  borderRadius: '16px',
                  padding: '16px 24px',
                  maxWidth: '400px'
                }
                : {}
          }
        >
          <div className="toast-content" style={(toast.isError || toast.isWarning) ? { display: 'flex', alignItems: 'center', gap: '16px' } : {}}>
            <span className="toast-icon" style={(toast.isError || toast.isWarning) ? { fontSize: '2.5rem' } : {}}>
              {toast.isError ? "\u{1F3C3}\u{1F4A8}" : toast.isWarning ? "\u26A0\uFE0F" : (!Array.isArray(toast.entries) && toast.user === "Success" ? "\u2705" : "\u{1F389}")}
            </span>
            <div className={`toast-copy${toast.isFullHouse ? " full-house-copy" : ""}`} style={(toast.isError || toast.isWarning) ? { display: 'flex', flexDirection: 'column', gap: '4px' } : {}}>
              {(toast.isError || toast.isWarning) && <strong style={{ fontSize: '1.2rem', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{toast.user}</strong>}
              {Array.isArray(toast.entries) ? (
                <div className="toast-lines">
                  {toast.entries.map((entry, index) => (
                    <span
                      key={`${entry.type}-${index}`}
                      className={`toast-message${index > 0 ? " toast-message-secondary" : ""}`}
                      style={(toast.isError || toast.isWarning) ? { fontSize: '1rem', opacity: 0.95, lineHeight: 1.4 } : {}}
                    >
                      {entry.tied
                        ? <>It's a tie! <strong>{entry.user}</strong> both completed {entry.label}!</>
                        : <>Congratulations <strong>{entry.user}</strong>! You have completed {entry.label}.</>}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="toast-message" style={(toast.isError || toast.isWarning) ? { fontSize: '1rem', opacity: 0.95, lineHeight: 1.4 } : {}}>
                  {toast.label}
                </span>
              )}
            </div>
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

      {!game?.winners?.fullHouse && !game?.winners?.secondFullHouse && (
        <div>
          <img className="tambola-banner" src="/assets/banner.webp" alt="Welcome to Housie" />
        </div>
      )}

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
        <div className="booking-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <div className="booking-bar-info">
            <span className="booking-bar-count">
              {selectedTickets.length} ticket{selectedTickets.length > 1 ? "s" : ""} selected
            </span>
            <span className="booking-bar-ids">{selectedTickets.join(", ")}</span>
          </div>

          <div className="booking-bar-inputs" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
            <input
              type="text"
              placeholder="Your Name *"
              value={bookingName}
              onChange={(e) => {
                setBookingName(e.target.value);
                if (nameError) setNameError(false);
              }}
              className={`booking-input ${nameError ? "input-error-shake" : ""}`}
              style={{
                padding: '6px 12px',
                width: '100%',
                borderRadius: '4px',
                border: nameError ? '2px solid #ff4444' : 'none',
                outline: 'none',
                transition: 'border 0.2s'
              }}
              required
            />
          </div>

          <div className="booking-bar-actions">
            <button onClick={clearSelection} className="booking-bar-clear">✕ Clear</button>
            <button onClick={handleBookTickets} disabled={isBooking} className="booking-bar-wa" style={{ border: 'none', cursor: 'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              {isBooking ? 'Booking...' : 'Book via WhatsApp'}
            </button>
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

        showVictoryScreen ? (
          <VictoryScreen
            game={game}
            tickets={tickets}
            setActiveModal={setActiveModal}
          />
        ) : null

      ) : (
        <main className="main-layout">
          <aside className="sidebar">
            <NumberBoard calledNumbers={displayCalledNumbers} />
          </aside>

          <section className="tickets-section">


            {game?.rules && (
              <div className="active-rules-bar">
                <span className="active-rules-label">💡 Active prizes:</span>
                {["topLine", "middleLine", "lastLine", "corners", "quickSeven", "fullHouse", "secondFullHouse"].map(r =>
                  game.rules[r] ? (
                    <span key={r} className="active-rule-chip">
                      {r === "corners" ? "🔶 Corners" : null}
                      {{ topLine: "🎯 Top Line", middleLine: "🎯 Middle Line", lastLine: "🎯 Last Line", quickSeven: "⚡ Quick 7", fullHouse: "🏆 Full House", secondFullHouse: "🏆 2nd Full House" }[r]}
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
  const starsLayerRef = useRef(null);
  const confettiLayerRef = useRef(null);

  useEffect(() => {
    // ── Stars ──
    const starsLayer = starsLayerRef.current;
    const confettiLayer = confettiLayerRef.current;
    const canvas = canvasRef.current;
    const root = rootRef.current;

    if (!starsLayer || !confettiLayer || !canvas || !root) return;

    starsLayer.innerHTML = "";
    for (let i = 0; i < 80; i++) {
      const s = document.createElement('div');
      s.className = 'vs-star';
      const sz = Math.random() * 2.5 + 0.5;
      s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random() * 100}%;top:${Math.random() * 100}%;--d:${(Math.random() * 3 + 1.5).toFixed(1)}s;animation-delay:${(Math.random() * 4).toFixed(1)}s`;
      starsLayer.appendChild(s);
    }

    // ── Confetti ──
    confettiLayer.innerHTML = "";
    const cfColors = ['#f5a623', '#ff6b6b', '#6bffce', '#ce6bff', '#6baeff', '#fff56b'];
    const intervals = [];

    function spawnConfetti() {
      const c = document.createElement('div');
      c.className = 'vs-cf';
      const dur = (Math.random() * 3 + 2.5).toFixed(1);
      c.style.cssText = `left:${Math.random() * 100}%;background:${cfColors[Math.floor(Math.random() * cfColors.length)]};width:${Math.random() * 8 + 5}px;height:${Math.random() * 8 + 5}px;border-radius:${Math.random() > 0.5 ? '50%' : '2px'};animation:vsCfFall ${dur}s 0s linear forwards`;
      confettiLayer.appendChild(c);
      setTimeout(() => c.remove(), parseFloat(dur) * 1000 + 200);
    }
    for (let i = 0; i < 55; i++) spawnConfetti();
    intervals.push(setInterval(spawnConfetti, 200));

    // ── Fireworks ──
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      intervals.forEach(clearInterval);
      return;
    }
    let W, H, animId;

    function resize() {
      W = canvas.width = root.offsetWidth;
      H = canvas.height = root.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const PALETTE = ['#f5a623', '#ff6b6b', '#ff6bce', '#6bffce', '#6baeff', '#ce6bff', '#fff', '#ffec6b', '#6bff8e'];
    const fwList = [];

    function Firework(x, y) {
      this.color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      this.particles = [];
      const count = 55 + Math.floor(Math.random() * 35);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
        const speed = 1.8 + Math.random() * 4.5;
        this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, decay: 0.012 + Math.random() * 0.016, size: 2 + Math.random() * 2.5, trail: [] });
      }
    }
    Firework.prototype.update = function () {
      this.particles.forEach(p => {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 5) p.trail.shift();
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.065; p.vx *= 0.97;
        p.life -= p.decay;
      });
      this.particles = this.particles.filter(p => p.life > 0);
    };
    Firework.prototype.draw = function () {
      this.particles.forEach(p => {
        ctx.save();
        for (let t = 0; t < p.trail.length - 1; t++) {
          ctx.beginPath();
          ctx.moveTo(p.trail[t].x, p.trail[t].y);
          ctx.lineTo(p.trail[t + 1].x, p.trail[t + 1].y);
          ctx.strokeStyle = this.color;
          ctx.globalAlpha = (t / p.trail.length) * p.life * 0.4;
          ctx.lineWidth = p.size * 0.5;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = p.life;
        ctx.fill();
        ctx.restore();
      });
    };
    Firework.prototype.done = function () { return this.particles.length === 0; };

    let lastLaunch = 0;
    function animate(ts) {
      animId = requestAnimationFrame(animate);
      ctx.fillStyle = 'rgba(10,8,22,0.18)';
      ctx.fillRect(0, 0, W, H);
      if (ts - lastLaunch > 380 + Math.random() * 500) {
        const x = W * 0.15 + Math.random() * W * 0.7;
        const y = H * 0.05 + Math.random() * H * 0.55;
        fwList.push(new Firework(x, y));
        if (Math.random() > 0.55) fwList.push(new Firework(W * 0.15 + Math.random() * W * 0.7, H * 0.05 + Math.random() * H * 0.55));
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
      starsLayer.innerHTML = "";
      confettiLayer.innerHTML = "";
    };
  }, []);

  const categories = [
    { key: 'fullHouse', title: 'FULL HOUSE!', emoji: '🎉🏆🏆🎉', label: 'Full House Winner' },
    { key: 'secondFullHouse', title: '2ND FULL HOUSE!', emoji: '🏆🏆', label: '2nd Full House Winner' },
    { key: 'corners', title: 'CORNERS', emoji: '🔶', label: 'Corners Winner' },
    { key: 'topLine', title: 'TOP LINE', emoji: '🎯', label: 'Top Line Winner' },
    { key: 'middleLine', title: 'MIDDLE LINE', emoji: '🎯', label: 'Middle Line Winner' },
    { key: 'lastLine', title: 'LAST LINE', emoji: '🎯', label: 'Last Line Winner' },
    { key: 'quickSeven', title: 'QUICK 7', emoji: '⚡', label: 'Quick 7 Winner' },
  ];

  return (
    <main className="vs-root" ref={rootRef}>
      <div className="vs-stars-layer" ref={starsLayerRef} />
      <canvas ref={canvasRef} className="vs-canvas" />
      <div className="vs-confetti-layer" ref={confettiLayerRef} />

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






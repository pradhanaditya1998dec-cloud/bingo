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
  subscribeAdminSettings, saveAdminSettings,
} from "../lib/gameStore";
import { checkWinners, WIN_TYPES, WIN_LABELS } from "../lib/tambola";
import { auth } from "../lib/firebase";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import NumberBoard from "../components/NumberBoard";
import BookTicket from "../components/BookTicket";
import BookingsTable from "../components/BookingsTable";
import PastWinnersTable from "../components/PastWinnersTable";
import ConfirmModal from "../components/ConfirmModal";
import NewGameModal from "../components/NewGameModal";
import Toast, { useToast } from "../components/Toast";

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
  {
    label: "Config",
    items: [
      { id: "settings", label: "Settings", icon: <IconSettings /> },
    ],
  },
];

const GAME_START_DELAY_MS = 8250;
const CALL_QUEUE_GAP_MS = 3200;
const WINNER_AUDIO_BY_TYPE = {
  topLine: "top-line.mp3",
  middleLine: "middle-line.mp3",
  lastLine: "bottom-line.mp3",
  corners: "corners.mp3",
  quickSeven: "quick-7.mp3",
  fullHouse: "bingo.mp3",
  secondFullHouse: "bingo.mp3",
};
const AUDIO_DURATION_FALLBACK_MS = {
  "winner-lines.wav": 1000,
  "top-line.mp3": 4000,
  "middle-line.mp3": 2000,
  "bottom-line.mp3": 3000,
  "corners.mp3": 2000,
  "quick-7.mp3": 3000,
};

// ── Icons ─────────────────────────────────────────────────
function IconSettings() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
}

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

  const [adminSettings, setAdminSettings] = useState({});
  const [settingsForm, setSettingsForm] = useState({ adminPhone: "", gameName: "", ticketPrice: "" });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");

  // subscribe to settings
  useEffect(() => {
    if (!user) return;
    return subscribeAdminSettings(s => {
      setAdminSettings(s);
      setSettingsForm({
        adminPhone:  s.adminPhone  || "",
        gameName:    s.gameName    || "",
        ticketPrice: s.ticketPrice || "",
      });
    });
  }, [user]);

  // handler
  async function handleSaveSettings(e) {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsMsg("");
    try {
      await saveAdminSettings({
        adminPhone:  settingsForm.adminPhone.trim(),
        gameName:    settingsForm.gameName.trim(),
        ticketPrice: settingsForm.ticketPrice.trim(),
      });
      setSettingsMsg("✓ Settings saved.");
      success("Settings saved!");
    } catch (err) {
      setSettingsMsg("Error: " + err.message);
    } finally {
      setSettingsSaving(false);
    }
  }

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
  const autoDrawEnabledRef = useRef(false);
  const autoStartTimerRef = useRef(null);
  const winnerResumeTimerRef = useRef(null);
  const winnerPauseUntilRef = useRef(0);
  const shouldResumeAutoAfterWinnerRef = useRef(false);
  const audioDurationCacheRef = useRef(new Map());
  const audioDurationPromiseRef = useRef(new Map());
  const callQueueRef = useRef([]);
  const callQueueTimerRef = useRef(null);
  const isProcessingQueueRef = useRef(false);

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

  useEffect(() => {
    return () => {
      clearTimeout(autoStartTimerRef.current);
      clearTimeout(winnerResumeTimerRef.current);
      clearTimeout(callQueueTimerRef.current);
    };
  }, []);

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
  useEffect(() => { autoDrawEnabledRef.current = autoDrawEnabled; }, [autoDrawEnabled]);

  async function getAudioDurationMs(filename) {
    if (!filename) return 0;

    if (audioDurationCacheRef.current.has(filename)) {
      return audioDurationCacheRef.current.get(filename);
    }

    if (audioDurationPromiseRef.current.has(filename)) {
      return audioDurationPromiseRef.current.get(filename);
    }

    const promise = new Promise((resolve) => {
      if (typeof window === "undefined") {
        resolve(AUDIO_DURATION_FALLBACK_MS[filename] || 0);
        return;
      }

      const audio = new Audio(`/audio/${filename}`);
      const cleanup = () => {
        audio.onloadedmetadata = null;
        audio.onerror = null;
        audioDurationPromiseRef.current.delete(filename);
      };

      audio.onloadedmetadata = () => {
        const durationMs = Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : (AUDIO_DURATION_FALLBACK_MS[filename] || 0);
        audioDurationCacheRef.current.set(filename, durationMs);
        cleanup();
        resolve(durationMs);
      };

      audio.onerror = () => {
        const durationMs = AUDIO_DURATION_FALLBACK_MS[filename] || 0;
        audioDurationCacheRef.current.set(filename, durationMs);
        cleanup();
        resolve(durationMs);
      };

      audio.preload = "metadata";
      audio.load();
    });

    audioDurationPromiseRef.current.set(filename, promise);
    return promise;
  }

  async function getWinnerPauseDurationMs(types, calledNumber) {
    const winnerLinesMs = await getAudioDurationMs("winner-lines.wav");
    const calledNumberMs = calledNumber ? await getAudioDurationMs(`${calledNumber}.mp3`) : 0;
    const ruleAudioMs = await Promise.all(
      types.map((type) => getAudioDurationMs(WINNER_AUDIO_BY_TYPE[type]))
    );

    return Math.max(calledNumberMs, winnerLinesMs) + ruleAudioMs.reduce((sum, ms) => sum + ms, 0) + 1000;
  }


  // ── Winner detection ──────────────────────────────────────
  useEffect(() => {
    if (!game?.calledNumbers?.length || !Object.keys(tickets).length) return;
    const rules = game.rules || { topLine: true, middleLine: true, lastLine: true, corners: false, quickSeven: true, secondFullHouse: false, fullHouse: true };

    async function detectWinners() {
      const bookedTickets = Object.values(tickets).filter(t => t.status === "booked");
      const regularWinnerTypes = [];
      const firstFullHouseWinnerIds = new Set(
        (Array.isArray(game.winners?.fullHouse) ? game.winners.fullHouse : game.winners?.fullHouse ? [game.winners.fullHouse] : [])
          .map((winner) => winner.ticketId)
      );

      for (const type of WIN_TYPES) {
        if (!rules[type]) continue;
        if (game.winners?.[type]) continue; // already recorded, skip

        // Collect ALL tickets that won this type simultaneously
        const winners = bookedTickets.filter(ticket => {
          const wins = checkWinners(ticket.numbers, game.calledNumbers);
          if (type === "secondFullHouse") {
            return wins.fullHouse && !firstFullHouseWinnerIds.has(ticket.id);
          }
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

        // Toast for each winner
        winners.forEach(t => success(`🎉 ${WIN_LABELS[type]}: ${t.userName} (${t.id})`));

        if (type === "fullHouse") {
          winners.forEach((winner) => firstFullHouseWinnerIds.add(winner.id));
        }

        if (type === "secondFullHouse" || (type === "fullHouse" && !rules.secondFullHouse)) {
          stopAutoDraw();
          await setGameStatus(gameId, "closed");
          const names = winners.map(t => t.userName).join(", ");
          success(`🏆 GAME OVER! ${WIN_LABELS[type]}: ${names}!`);
        } else {
          regularWinnerTypes.push(type);
        }
      }

      if (regularWinnerTypes.length) {
        const lastCalledNumber = game.calledNumbers?.[game.calledNumbers.length - 1] ?? null;
        const pauseMs = await getWinnerPauseDurationMs(regularWinnerTypes, lastCalledNumber);
        pauseForWinnerSequence(pauseMs);
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
        setGameStatus(gameId, "live")
          .then(() => {
            gameRef.current = { ...(gameRef.current || {}), status: "live" };
            scheduleAutoDrawStart();
          })
          .catch(console.error);
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
  useEffect(() => {
    if (game?.status === "live") return;
    clearTimeout(autoStartTimerRef.current);
    autoStartTimerRef.current = null;
    clearTimeout(winnerResumeTimerRef.current);
    winnerResumeTimerRef.current = null;
    winnerPauseUntilRef.current = 0;
    shouldResumeAutoAfterWinnerRef.current = false;
    clearTimeout(callQueueTimerRef.current);
    callQueueTimerRef.current = null;
    callQueueRef.current = [];
    isProcessingQueueRef.current = false;
    setDrawing(false);
    stopAutoDraw();
  }, [game?.status]);

  // ── Draw ──────────────────────────────────────────────────
  const drawOne = useCallback(async (specificNumber = null) => {
    const g = gameRef.current;
    if (!g || g.status !== "live") return;
    let num;
    if (specificNumber !== null) {
      if (calledSet.current.has(specificNumber)) return;
      num = specificNumber;
    } else {
      const queuedSpecificNumbers = new Set(
        callQueueRef.current
          .filter((entry) => entry.type === "specific")
          .map((entry) => entry.number)
      );
      const rem = [];
      for (let n = 1; n <= 90; n++) {
        if (!calledSet.current.has(n) && !queuedSpecificNumbers.has(n)) rem.push(n);
      }
      if (!rem.length) {
        if (queuedSpecificNumbers.size > 0) return;
        info("All 90 numbers called!");
        stopAutoDraw();
        return;
      }
      num = rem[Math.floor(Math.random() * rem.length)];
    }
    setDrawing(true);
    await callNumber(gameId, num);
  }, [gameId]);

  function isWinnerPauseActive() {
    return winnerPauseUntilRef.current > Date.now();
  }

  function restartAutoCountdown() {
    clearInterval(autoCountdownRef.current);
    autoCountdownRef.current = null;
    setAutoCountdown(autoDrawInterval);
    autoCountdownRef.current = setInterval(() =>
      setAutoCountdown(p => p <= 1 ? autoDrawInterval : p - 1), 1000);
  }

  function scheduleNextAutoDraw(delayMs = autoDrawInterval * 1000) {
    clearTimeout(autoDrawRef.current);
    autoDrawRef.current = null;

    if (!autoDrawEnabledRef.current || isWinnerPauseActive() || gameRef.current?.status !== "live") {
      return;
    }

    restartAutoCountdown();
    autoDrawRef.current = setTimeout(() => {
      autoDrawRef.current = null;
      enqueueDrawRequest();
    }, delayMs);
  }

  function pauseForWinnerSequence(durationMs) {
    const clampedDuration = Math.max(durationMs, CALL_QUEUE_GAP_MS);
    const resumeAt = Date.now() + clampedDuration;

    winnerPauseUntilRef.current = Math.max(winnerPauseUntilRef.current, resumeAt);
    shouldResumeAutoAfterWinnerRef.current = autoDrawEnabledRef.current || shouldResumeAutoAfterWinnerRef.current;

    clearTimeout(autoDrawRef.current);
    autoDrawRef.current = null;
    clearInterval(autoCountdownRef.current);
    autoCountdownRef.current = null;
    autoDrawEnabledRef.current = false;
    setAutoDrawEnabled(false);
    setAutoCountdown(0);

    clearTimeout(callQueueTimerRef.current);
    callQueueTimerRef.current = null;
    isProcessingQueueRef.current = false;
    setDrawing(false);

    clearTimeout(winnerResumeTimerRef.current);
    winnerResumeTimerRef.current = setTimeout(() => {
      winnerResumeTimerRef.current = null;

      if (winnerPauseUntilRef.current > Date.now()) {
        pauseForWinnerSequence(winnerPauseUntilRef.current - Date.now());
        return;
      }

      winnerPauseUntilRef.current = 0;

      if (callQueueRef.current.length) {
        processCallQueue();
      }

      if (shouldResumeAutoAfterWinnerRef.current && gameRef.current?.status === "live") {
        shouldResumeAutoAfterWinnerRef.current = false;
        startAutoDraw();
      } else {
        shouldResumeAutoAfterWinnerRef.current = false;
      }
    }, clampedDuration);
  }

  const processCallQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;

    const g = gameRef.current;
    if (!g || g.status !== "live") {
      callQueueRef.current = [];
      setDrawing(false);
      return;
    }

    const nextRequest = callQueueRef.current.shift();
    if (!nextRequest) {
      setDrawing(false);
      return;
    }

    isProcessingQueueRef.current = true;

    let requestedNumber = null;
    if (nextRequest.type === "specific") {
      requestedNumber = nextRequest.number;
      if (calledSet.current.has(requestedNumber)) {
        isProcessingQueueRef.current = false;
        processCallQueue();
        return;
      }
    }

    try {
      await drawOne(requestedNumber);
      if (
        autoDrawEnabledRef.current &&
        !isWinnerPauseActive() &&
        gameRef.current?.status === "live" &&
        callQueueRef.current.length === 0
      ) {
        scheduleNextAutoDraw();
      }
    } finally {
      callQueueTimerRef.current = setTimeout(() => {
        isProcessingQueueRef.current = false;
        if (callQueueRef.current.length) {
          processCallQueue();
        } else {
          setDrawing(false);
        }
      }, CALL_QUEUE_GAP_MS);
    }
  }, [drawOne]);

  const enqueueDrawRequest = useCallback((specificNumber = null) => {
    const g = gameRef.current;
    if (!g || g.status !== "live") return;

    if (specificNumber !== null) {
      const activeOrQueuedSpecific = callQueueRef.current.some(
        (entry) => entry.type === "specific" && entry.number === specificNumber
      );
      if (calledSet.current.has(specificNumber) || activeOrQueuedSpecific) return;

      // Manual picks get priority over any queued auto call, but keep the queue
      // to a single "next" item so the board never jumps ahead by multiple calls.
      callQueueRef.current = [{ type: "specific", number: specificNumber }];
      if (autoDrawEnabledRef.current) {
        scheduleNextAutoDraw();
      }
    } else {
      // Never stack multiple future auto calls. One active call + one queued call is enough.
      if (callQueueRef.current.length > 0) return;
      callQueueRef.current.push({ type: "random" });
    }

    if (!isWinnerPauseActive() && !isProcessingQueueRef.current) {
      processCallQueue();
    }
  }, [processCallQueue]);

  function startAutoDraw() {
    if (autoDrawEnabledRef.current) return;
    autoDrawEnabledRef.current = true;
    setAutoDrawEnabled(true);
    if (isWinnerPauseActive()) return;
    enqueueDrawRequest();
  }

  function scheduleAutoDrawStart(delayMs = GAME_START_DELAY_MS) {
    clearTimeout(autoStartTimerRef.current);
    autoStartTimerRef.current = setTimeout(() => {
      autoStartTimerRef.current = null;
      startAutoDraw();
    }, delayMs);
  }

  function stopAutoDraw() {
    clearTimeout(autoDrawRef.current); autoDrawRef.current = null;
    clearInterval(autoCountdownRef.current); autoCountdownRef.current = null;
    clearTimeout(callQueueTimerRef.current); callQueueTimerRef.current = null;
    clearTimeout(winnerResumeTimerRef.current); winnerResumeTimerRef.current = null;
    callQueueRef.current = [];
    isProcessingQueueRef.current = false;
    winnerPauseUntilRef.current = 0;
    shouldResumeAutoAfterWinnerRef.current = false;
    autoDrawEnabledRef.current = false;
    setAutoDrawEnabled(false); setAutoCountdown(0);
    setDrawing(false);
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
        .map(([k]) => ({ topLine: "Top", middleLine: "Middle", lastLine: "Last", corners: "Corners", quickSeven: "Quick 7", fullHouse: "Full House", secondFullHouse: "2nd Full House" }[k]))
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

  function confirmStartGame() {
    setModal({
      open: true,
      title: "Start Game?",
      message: "This will make the game live and enable number calling for players. Are you sure?",
      confirmLabel: "Yes, Start Game",
      danger: false,
      onConfirm: async () => {
        setModal(m => ({ ...m, open: false }));
        await setGameStatus(gameId, "live");
        gameRef.current = { ...(gameRef.current || {}), status: "live" };
        success("Game started.");
        scheduleAutoDrawStart();
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
                            {r === "corners" ? "🔶 Corners" : null}
                            {r === "corners" ? "🔶 Corners" : null}
                            {r === "corners" ? "🔶 Corners" : null}
                            {r === "corners" ? "🔶 Corners" : null}
                            {{ topLine:"Top Line", middleLine:"Middle Line", lastLine:"Last Line", fullHouse:"Full House" }[r]}
                          </span>
                        ) : null
                      )} */}
                      {["topLine", "middleLine", "lastLine", "corners", "quickSeven", "fullHouse", "secondFullHouse"].map(r =>
                        game.rules[r] ? (
                          <span key={r} className="active-rule-chip">
                            {r === "corners" ? "Corners" : ({ topLine: "Top Line", middleLine: "Middle Line", lastLine: "Last Line", quickSeven: "Quick 7", fullHouse: "Full House", secondFullHouse: "2nd Full House" }[r])}
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
                      onClick={confirmStartGame}
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
                    onClick={() => { stopAutoDraw(); enqueueDrawRequest(); }}
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
                    {/* {autoDrawEnabled && (
                      <div className="autodraw-active-bar">
                        <div className="autodraw-progress" style={{ animationDuration: `${autoDrawInterval}s` }} />
                      </div>
                    )} */}
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
                      ? "Number board of the current live game."
                      : game?.status === "closed"
                        ? "Game ended — create a new game to play again"
                        : "Start the game to enable the number board"}
                  </p>
                  <NumberBoard
                    key={gameId ?? "empty"}
                    calledNumbers={calledArr}
                    interactive={game?.status === "live"}
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

              {/* ── SETTINGS ── */}
              {activeRoute === "settings" && (
                <section className="admin-card" style={{ gridColumn: "1 / -1" }}>
                  <h2>Settings</h2>
                  <p className="hint" style={{ marginBottom: 20 }}>
                    These values are saved to Firestore and used across the app in real time.
                  </p>

                  <form onSubmit={handleSaveSettings}>

                    {/* WhatsApp Number */}
                    <div className="settings-field">
                      <label className="settings-label">WhatsApp Admin Number</label>
                      <p className="hint">Include country code, no + or spaces. E.g. <code>917628863362</code></p>
                      <input
                        type="text"
                        className="admin-input"
                        placeholder="917628863362"
                        value={settingsForm.adminPhone}
                        onChange={e => setSettingsForm(f => ({ ...f, adminPhone: e.target.value }))}
                      />
                      {adminSettings.adminPhone && (
                        <p className="hint" style={{ marginTop: 4 }}>
                          Current:{" "}
                          <a
                            href={`https://wa.me/${adminSettings.adminPhone}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--accent)" }}
                          >
                            wa.me/{adminSettings.adminPhone}
                          </a>
                        </p>
                      )}
                    </div>

                    {/* Game Name */}
                    <div className="settings-field">
                      <label className="settings-label">Game Name</label>
                      <p className="hint">Shown to players on the booking page.</p>
                      <input
                        type="text"
                        className="admin-input"
                        placeholder="Sunday Tambola"
                        value={settingsForm.gameName}
                        onChange={e => setSettingsForm(f => ({ ...f, gameName: e.target.value }))}
                      />
                    </div>

                    {/* Ticket Price */}
                    <div className="settings-field">
                      <label className="settings-label">Ticket Price (₹)</label>
                      <p className="hint">Shown on the player booking page.</p>
                      <input
                        type="number"
                        className="admin-input"
                        placeholder="50"
                        value={settingsForm.ticketPrice}
                        onChange={e => setSettingsForm(f => ({ ...f, ticketPrice: e.target.value }))}
                        style={{ maxWidth: 160 }}
                      />
                    </div>

                    {settingsMsg && (
                      <p
                        className={settingsMsg.startsWith("✓") ? "success-msg" : "error-msg"}
                        style={{ marginBottom: 12 }}
                      >
                        {settingsMsg}
                      </p>
                    )}

                    <button type="submit" className="admin-btn primary" disabled={settingsSaving}>
                      {settingsSaving ? "Saving…" : "💾 Save Settings"}
                    </button>

                  </form>
                </section>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


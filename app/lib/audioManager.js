// lib/audioManager.js
if (typeof window === "undefined") {
  module.exports = {
    initAudio: () => { },
    announceNumber: () => { },
    preloadAudio: () => { },
    playAudioFile: () => { },
    playAudioFileLooping: () => { },
    stopLoopingAudio: () => { },
    playGameStartCountdown: () => { },
    playWinnerSound: () => { },
  };
}

// ── State ──────────────────────────────────────────────────
let audioEl = null;
let winnerEl = null;
let unlocked = false;
let loopingSrc = null;

// ── Unlock on first user gesture ───────────────────────────
function unlock() {
  if (unlocked) return;
  unlocked = true;

  audioEl = new Audio();
  audioEl.preload = "auto";
  audioEl.volume = 0;
  audioEl.src = "/audio/1.mp3";

  winnerEl = new Audio();
  winnerEl.preload = "auto";
  winnerEl.volume = 1;

  audioEl
    .play()
    .then(() => {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.volume = 1;
      audioEl.loop = false;
      audioEl.addEventListener("ended", onAudioEnded);
      startPreload();
    })
    .catch(() => {
      unlocked = false;
    });
}

if (typeof document !== "undefined") {
  ["touchstart", "touchend", "mousedown", "keydown", "click"].forEach(evt => {
    document.addEventListener(evt, unlock, { once: true, passive: true });
  });
}

// ── Ended handler ───────────────────────────────────────────
function onAudioEnded() {
  if (loopingSrc) _startLoop(loopingSrc);
}

// ── Internal loop starter ───────────────────────────────────
// Fully resets listener state before starting the loop.
// Prevents duplicate onAudioEnded listeners from stale queue handlers.
function _startLoop(src) {
  if (!audioEl) return;

  audioEl.removeEventListener("ended", onAudioEnded);
  audioQueue = [];
  isQueueActive = false;

  audioEl.addEventListener("ended", onAudioEnded);

  if (!audioEl.paused) audioEl.pause();
  audioEl.currentTime = 0;
  audioEl.src = src;
  audioEl.load();
  audioEl.play().catch(err => {
    if (err.name !== "AbortError")
      console.warn("Loop play failed:", src, err.name);
  });
}

// ── Internal one-shot play helper ───────────────────────────
function _playSrc(src) {
  if (!audioEl) return;
  audioEl.loop = false;
  if (!audioEl.paused) audioEl.pause();
  audioEl.currentTime = 0;
  audioEl.src = src;
  audioEl.load();
  audioEl.play().catch(err => {
    if (err.name !== "AbortError")
      console.warn("Audio play failed:", src, err.name, err.message);
  });
}

// ── Audio Queue ─────────────────────────────────────────────
let audioQueue = [];
let isQueueActive = false;

function _enqueue(src, onEnd) {
  audioQueue.push({ src, onEnd });
  loopingSrc = null;
  if (!isQueueActive) {
    isQueueActive = true;
    _playNextInQueue();
  }
}

function _playNextInQueue() {
  if (!audioQueue.length) {
    isQueueActive = false;
    return;
  }
  const { src, onEnd } = audioQueue.shift();

  audioEl.removeEventListener("ended", onAudioEnded);

  const handleEnd = () => {
    audioEl.removeEventListener("ended", handleEnd);

    if (typeof onEnd === "function") {
      try { onEnd(); } catch (e) { console.warn("onEnd callback error:", e); }
    }

    if (audioQueue.length) {
      // More items — keep going without re-attaching onAudioEnded yet
      _playNextInQueue();
    } else {
      // Queue drained — re-attach onAudioEnded cleanly once
      isQueueActive = false;
      audioEl.addEventListener("ended", onAudioEnded);
    }
  };

  audioEl.addEventListener("ended", handleEnd);

  if (!audioEl.paused) audioEl.pause();
  audioEl.currentTime = 0;
  audioEl.src = src;
  audioEl.load();
  audioEl.play().catch(err => {
    if (err.name !== "AbortError")
      console.warn("Queue play failed:", src, err.name);
    handleEnd();
  });
}

// ── Secondary element helper ────────────────────────────────
function _playWinnerSrc(src, volume = 1) {
  if (!winnerEl) return;
  winnerEl.pause();
  winnerEl.currentTime = 0;
  winnerEl.src = src;
  winnerEl.volume = volume;
  winnerEl.load();
  winnerEl.play().catch(err => {
    if (err.name !== "AbortError")
      console.warn("Winner audio failed:", src, err.name);
  });
}

// ── Public API ──────────────────────────────────────────────

export function initAudio() { }

export function announceNumber(n, onEnd) {
  if (typeof window === "undefined" || !unlocked) return;
  _enqueue(`/audio/${n}.mp3`, onEnd);
}

export function playWinnerSound() {
  if (typeof window === "undefined" || !unlocked) return;
  _playWinnerSrc("/audio/winner-lines.wav", 0.9);
}

export function playAudioFile(filename) {
  if (typeof window === "undefined" || !unlocked) return;
  _enqueue(`/audio/${filename}`, null);
}

export function playAudioFileLooping(filename) {
  if (typeof window === "undefined" || !unlocked) return;
  loopingSrc = `/audio/${filename}`;
  _startLoop(loopingSrc);
}

export function stopLoopingAudio() {
  if (typeof window === "undefined") return;
  loopingSrc = null;
  if (audioEl && !audioEl.paused) {
    audioEl.pause();
    audioEl.currentTime = 0;
  }
}

export function playGameStartCountdown() {
  if (typeof window === "undefined" || !unlocked) return;
  ["/audio/5.mp3", "/audio/4.mp3", "/audio/3.mp3", "/audio/2.mp3", "/audio/1.mp3"]
    .forEach(src => _enqueue(src, null));
}

export function preloadAudio() { }

// ── Background preload ──────────────────────────────────────
let preloadQueue = [];
let preloading = false;

function startPreload() {
  if (preloading) return;
  preloading = true;
  preloadQueue = Array.from({ length: 90 }, (_, i) => i + 1);
  preloadNext();
}

async function preloadNext() {
  if (!preloadQueue.length) { preloading = false; return; }
  const n = preloadQueue.shift();
  try { await fetch(`/audio/${n}.mp3`, { priority: "low" }); } catch (_) { }
  setTimeout(preloadNext, 80);
}
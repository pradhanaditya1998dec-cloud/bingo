import {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, arrayUnion, writeBatch, runTransaction, query, where
} from "firebase/firestore";
import { db } from "./firebase";
import { generateTickets } from "./tambola";

const META_ID = "_meta";

// ── Active game ID ─────────────────────────────────────────
// Cost: 1 read on mount, then 1 per meta change (very rare)
export function subscribeActiveGameId(callback) {
  return onSnapshot(doc(db, "games", META_ID), snap =>
    callback(snap.exists() ? snap.data().activeGameId : null)
  );
}

// ── Init game ──────────────────────────────────────────────
// Tickets stored as a MAP field, not a sub-collection
export async function initTodayGame(gameId, rules = {}, { ticketPrice = null, prizes = {} } = {}) {
  const id = gameId || new Date().toISOString().split("T")[0];
  await setDoc(doc(db, "games", id), {
    id,
    status: "waiting",
    calledNumbers: [],
    winners: {},
    tickets: {},          // populated by initTickets() below
    createdAt: Date.now(),
    scheduledAt: null,
    ticketPrice: ticketPrice ?? null,
    prizes: {
      topLine:         rules.topLine ? (prizes.topLine || 0) : 0,
      middleLine:      rules.middleLine ? (prizes.middleLine || 0) : 0,
      lastLine:        rules.lastLine ? (prizes.lastLine || 0) : 0,
      corners:         rules.corners ? (prizes.corners || 0) : 0,
      quickSeven:      rules.quickSeven ? (prizes.quickSeven || 0) : 0,
      secondFullHouse: rules.secondFullHouse ? (prizes.secondFullHouse || 0) : 0,
      fullHouse:       prizes.fullHouse || 0,
    },
    rules: {
      topLine:    rules.topLine    ?? true,
      middleLine: rules.middleLine ?? true,
      lastLine:   rules.lastLine   ?? true,
      corners:    rules.corners    ?? false,
      quickSeven: rules.quickSeven ?? false,
      secondFullHouse: rules.secondFullHouse ?? false,
      fullHouse:  true,   // always on
    },
  });
  await setDoc(doc(db, "games", META_ID), { activeGameId: id }, { merge: true });
  return id;
}

// ── Init tickets ───────────────────────────────────────────
// Single write — updates the `tickets` map field on the game doc
// Cost: 1 write (was: 50+ writes, 50+ reads for delete)
export async function initTickets(gameId, count = 50, sheetSize = 6) {
  const tickets = generateTickets(count, sheetSize);
  const ticketsMap = {};
  tickets.forEach(t => { ticketsMap[t.id] = t; });

  // One atomic update — replaces the entire tickets map
  await updateDoc(doc(db, "games", gameId), { tickets: ticketsMap });
}

// ── Subscribe to game (includes tickets map inside) ────────
// ONE listener, ONE document = 1 read per change for ALL connected users
export function subscribeGame(gameId, callback) {
  return onSnapshot(doc(db, "games", gameId), snap =>
    callback(snap.exists() ? snap.data() : null)
  );
}

// ── Subscribe to tickets ───────────────────────────────────
// Now just a thin wrapper over subscribeGame — no extra listener/reads
// Left here so existing code calling subscribeTickets() still compiles
export function subscribeTickets(gameId, callback) {
  return onSnapshot(doc(db, "games", gameId), snap => {
    callback(snap.exists() ? (snap.data().tickets || {}) : {});
  });
}

// ── Number draw ────────────────────────────────────────────
// Cost: 1 write per draw (unchanged)
export async function callNumber(gameId, number) {
  await updateDoc(doc(db, "games", gameId), {
    calledNumbers: arrayUnion(number),
  });
}

// ── Game status + schedule ─────────────────────────────────
export async function setGameStatus(gameId, status) {
  const updates = { status };
  if (status === "live") {
    updates.startedAt = Date.now();
  }
  await updateDoc(doc(db, "games", gameId), updates);
}

export async function setScheduledTime(gameId, scheduledAt) {
  await updateDoc(doc(db, "games", gameId), { scheduledAt: scheduledAt ?? null });
}

// ── Winners — supports multiple tied winners per category ──
// Each win type holds an array: [{ ticketId, userName, ... }, ...]
export async function recordWinner(gameId, winType, ticketId, userName, userPhone) {
  await updateDoc(doc(db, "games", gameId), {
    [`winners.${winType}`]: arrayUnion({
      ticketId,
      userName,
      userPhone: userPhone || null,
      claimedAt: Date.now(),
    }),
  });
}

export async function recordAllWinners(gameId, winType, winnersArray) {
  await updateDoc(doc(db, "games", gameId), {
    [`winners.${winType}`]: winnersArray,
  });
}

// ── Ticket booking ─────────────────────────────────────────
// Updates the ticket inside the game doc's tickets map field
// + writes a lightweight record to the flat `bookings` collection
//
// Cost: 2 writes per booking (1 game doc update + 1 booking doc)
// Previously: 1 write to ticket sub-collection (but reads were expensive)

export async function bookTicket(gameId, ticketId, { userName, userPhone }) {
  const bookedAt = Date.now();

  // Update ticket inside game doc (map field dot-notation)
  await updateDoc(doc(db, "games", gameId), {
    [`tickets.${ticketId}.status`]:        "booked",
    [`tickets.${ticketId}.userName`]:      userName,
    [`tickets.${ticketId}.userPhone`]:     userPhone,
    [`tickets.${ticketId}.bookedAt`]:      bookedAt,
    [`tickets.${ticketId}.paymentStatus`]: "unpaid",
  });

  // Write to flat bookings collection for getAllBookings() queries
  await setDoc(doc(db, "bookings", `${gameId}_${ticketId}`), {
    gameId, ticketId, userName, userPhone, bookedAt, gameStatus: "waiting", paymentStatus: "unpaid",
  });
}

export async function bookMultipleTickets(gameId, ticketIds, { userName, userPhone }) {
  const bookedAt = Date.now();
  const batch = writeBatch(db);

  // Build one update object for all tickets (single game doc write)
  const updates = {};
  ticketIds.forEach(id => {
    updates[`tickets.${id}.status`]        = "booked";
    updates[`tickets.${id}.userName`]      = userName;
    updates[`tickets.${id}.userPhone`]     = userPhone;
    updates[`tickets.${id}.bookedAt`]      = bookedAt;
    updates[`tickets.${id}.paymentStatus`] = "unpaid";
  });
  batch.update(doc(db, "games", gameId), updates);

  // Write each booking to flat bookings collection
  ticketIds.forEach(ticketId => {
    batch.set(doc(db, "bookings", `${gameId}_${ticketId}`), {
      gameId, ticketId, userName, userPhone, bookedAt, gameStatus: "waiting", paymentStatus: "unpaid",
    });
  });

  await batch.commit();
}

export async function bookTicketsWithTransaction(gameId, ticketIds, { userName, userPhone }) {
  const gameRef = doc(db, "games", gameId);
  const bookedAt = Date.now();
  
  return await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) {
      throw new Error("Game does not exist!");
    }

    const data = gameDoc.data();
    const tickets = data.tickets || {};
    
    const alreadyBooked = [];
    const availableTickets = [];
    
    for (const ticketId of ticketIds) {
      if (tickets[ticketId]?.status === "booked") {
        alreadyBooked.push(ticketId);
      } else {
        availableTickets.push(ticketId);
      }
    }
    
    if (availableTickets.length === 0) {
      // All requested tickets are already taken — use a tagged error so the
      // caller can distinguish this from a generic Firestore failure
      const err = new Error(`All tickets already booked: ${alreadyBooked.join(", ")}`);
      err.code = "ALL_TICKETS_BOOKED";
      err.alreadyBooked = alreadyBooked;
      throw err;
    }

    const updates = {};
    for (const id of availableTickets) {
      updates[`tickets.${id}.status`]        = "booked";
      updates[`tickets.${id}.userName`]      = userName;
      updates[`tickets.${id}.userPhone`]     = userPhone;
      updates[`tickets.${id}.bookedAt`]      = bookedAt;
      updates[`tickets.${id}.paymentStatus`] = "unpaid";
    }
    transaction.update(gameRef, updates);
    
    for (const ticketId of availableTickets) {
      const bookingRef = doc(db, "bookings", `${gameId}_${ticketId}`);
      transaction.set(bookingRef, {
        gameId, ticketId, userName, userPhone, bookedAt, gameStatus: "waiting", paymentStatus: "unpaid"
      });
    }
    
    return { booked: availableTickets, failed: alreadyBooked };
  });
}

// ── Release / unbook a ticket ──────────────────────────────
export async function releaseTicket(gameId, ticketId) {
  // Reset ticket in game doc
  await updateDoc(doc(db, "games", gameId), {
    [`tickets.${ticketId}.status`]:        "free",
    [`tickets.${ticketId}.userName`]:      null,
    [`tickets.${ticketId}.userPhone`]:     null,
    [`tickets.${ticketId}.bookedAt`]:      null,
    [`tickets.${ticketId}.paymentStatus`]: null,
  });

  // Remove from bookings collection
  await deleteDoc(doc(db, "bookings", `${gameId}_${ticketId}`));
}

// ── Toggle Booking Payment Status ───────────────────────────
export async function toggleBookingPaymentStatus(gameId, ticketId, currentStatus) {
  const nextStatus = currentStatus === "paid" ? "unpaid" : "paid";
  
  // 1. Update flat booking doc
  await updateDoc(doc(db, "bookings", `${gameId}_${ticketId}`), {
    paymentStatus: nextStatus
  });

  // 2. Update ticket inside game doc
  await updateDoc(doc(db, "games", gameId), {
    [`tickets.${ticketId}.paymentStatus`]: nextStatus
  });
  
  return nextStatus;
}

// ── Get tickets (one-time read) ────────────────────────────
// Cost: 1 read (reads game doc, extracts tickets map)
export async function getGameTickets(gameId) {
  const snap = await getDoc(doc(db, "games", gameId));
  return snap.exists() ? (snap.data().tickets || {}) : {};
}

// ── All bookings across all games ──────────────────────────
// Reads flat bookings collection — no cross-game ticket scanning
// Cost: N reads where N = total bookings ever (much cheaper than before)
export async function getAllBookings() {
  const snap = await getDocs(collection(db, "bookings"));
  const bookings = [];
  snap.forEach(d => bookings.push(d.data()));
  return bookings.sort((a, b) => (b.bookedAt || 0) - (a.bookedAt || 0));
}

// ── Past games (winners history) ───────────────────────────
// Reads game docs only — strips large tickets map before returning
// Cost: N reads where N = number of past games (typically < 30)
export async function getAllPastGames() {
  const snap = await getDocs(collection(db, "games"));
  const games = [];
  snap.forEach(d => {
    if (d.id === META_ID) return;
    const data = d.data();
    if (data.status === "closed" || Object.keys(data.winners || {}).length > 0) {
      // Strip tickets map — not needed for history display, saves bandwidth
      const { tickets: _tickets, ...gameData } = data;
      games.push(gameData);
    }
  });
  return games.sort((a, b) => b.id.localeCompare(a.id));
}

// ── WhatsApp helper ────────────────────────────────────────
export function normalizeWhatsAppPhone(adminPhone = "") {
  return String(adminPhone).replace(/\D/g, "");
}

function buildWhatsAppMessage(ticketIds, userName = "") {
  const ids = Array.isArray(ticketIds) ? ticketIds : [ticketIds];
  const nameIntro = userName ? `My name is ${userName}. ` : "";
  return encodeURIComponent(
    `Hi! ${nameIntro}I'd like to book Tambola ${ids.length > 1 ? "tickets" : "ticket"} ${ids.join(", ")} for today's game. Please confirm my booking.`
  );
}

export function buildWhatsAppLink(ticketIds, adminPhone, userName = "") {
  const phone = normalizeWhatsAppPhone(adminPhone);
  const msg = buildWhatsAppMessage(ticketIds, userName);
  return `https://wa.me/${phone}?text=${msg}`;
}

// ── Game ID helpers ────────────────────────────────────────
export function generateGameId() {
  const now = new Date();
  const y  = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d  = String(now.getDate()).padStart(2, "0");
  const h  = String(now.getHours()).padStart(2, "0");
  const m  = String(now.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d}_${h}-${m}`;
}

export function formatGameId(gameId) {
  if (!gameId) return "";
  const [datePart, timePart] = gameId.split("_");
  const [y, m, d] = datePart.split("-").map(Number);
  const dateStr = new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
  if (!timePart) return dateStr;
  const [h, mn] = timePart.split("-").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${dateStr} · ${hour}:${String(mn).padStart(2, "0")} ${ampm}`;
}

export async function reopenGame(gameId) {
  await updateDoc(doc(db, "games", gameId), { 
    status: "waiting",
    calledNumbers: [],   // reset the draw
    winners: {},         // clear any past winners
  });
}

// ── Admin Settings ─────────────────────────────────────────
export async function getAdminSettings() {
  const snap = await getDoc(doc(db, "games", "_settings"));
  return snap.exists() ? snap.data() : {};
}

export async function saveAdminSettings(settings) {
  await setDoc(doc(db, "games", "_settings"), settings, { merge: true });
}

export function subscribeAdminSettings(callback) {
  return onSnapshot(doc(db, "games", "_settings"), snap =>
    callback(snap.exists() ? snap.data() : {})
  );
}

export async function deleteGame(gameId) {
  // 1. Delete game document
  await deleteDoc(doc(db, "games", gameId));
  
  // 2. Fetch and delete bookings belonging to this game
  const q = query(collection(db, "bookings"), where("gameId", "==", gameId));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(docSnap => {
    batch.delete(docSnap.ref);
  });
  await batch.commit();

  // 3. Clear active game ID if it matches
  const metaRef = doc(db, "games", "_meta");
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists() && metaSnap.data().activeGameId === gameId) {
    await updateDoc(metaRef, { activeGameId: null });
  }
}

export async function getAllGames() {
  const snap = await getDocs(collection(db, "games"));
  const games = [];
  snap.forEach(d => {
    if (d.id === META_ID || d.id === "_settings") return;
    games.push(d.data());
  });
  return games.sort((a, b) => b.id.localeCompare(a.id));
}

export async function markAllBookingsAsPaid(gameId, ticketIds) {
  if (ticketIds.length === 0) return;
  const batch = writeBatch(db);
  
  // 1. Update flat bookings collection docs
  ticketIds.forEach(ticketId => {
    batch.update(doc(db, "bookings", `${gameId}_${ticketId}`), {
      paymentStatus: "paid"
    });
  });

  // 2. Build map updates for the game document
  const gameUpdates = {};
  ticketIds.forEach(ticketId => {
    gameUpdates[`tickets.${ticketId}.paymentStatus`] = "paid";
  });
  batch.update(doc(db, "games", gameId), gameUpdates);

  await batch.commit();
}
export async function saveRiggedWinners(gameId, riggedWinners, riggedSequence) {
  await updateDoc(doc(db, "games", gameId), {
    riggedWinners,
    riggedSequence
  });
}

export async function updateGameTicketPrice(gameId, ticketPrice) {
  await updateDoc(doc(db, "games", gameId), {
    ticketPrice: Number(ticketPrice)
  });
}

export async function updateGameRulesAndPrizes(gameId, rules, prizes) {
  await updateDoc(doc(db, "games", gameId), {
    rules,
    prizes
  });
}



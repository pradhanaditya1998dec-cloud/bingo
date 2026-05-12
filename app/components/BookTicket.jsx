"use client";
import { useState } from "react";
import { bookMultipleTickets, releaseTicket, unfreezeTicket } from "../lib/gameStore";

function initials(name) {
  return name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

const AVATAR_COLORS = [
  { bg: "var(--color-background-info)", color: "var(--color-text-info)" },
  { bg: "var(--color-background-success)", color: "var(--color-text-success)" },
  { bg: "var(--color-background-warning)", color: "var(--color-text-warning)" },
];

function avatarColor(name) {
  const i = (name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}

export default function BookTicket({ gameId, freeTickets, bookedTickets = [], frozenTickets = [], gameStatus, onBooked }) {
  const [selectedTickets, setSelectedTickets] = useState([]);
  const [form, setForm] = useState({ userName: "", userPhone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [releasing, setReleasing] = useState(null);
  const [unfreezing, setUnfreezing] = useState(null);

  const sortedFree = [...freeTickets].sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));

  // Group booked tickets by player
  const playerMap = {};
  bookedTickets.forEach(t => {
    const key = t.userPhone || t.userName;
    if (!playerMap[key]) playerMap[key] = { userName: t.userName, userPhone: t.userPhone, tickets: [] };
    playerMap[key].tickets.push(t.id);
  });
  const players = Object.values(playerMap).sort((a, b) => a.userName.localeCompare(b.userName));

  function toggleTicket(id) {
    setSelectedTickets(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }

  function selectAll() { setSelectedTickets(sortedFree.map(t => t.id)); }
  function clearAll() { setSelectedTickets([]); }

  async function handleBook() {
    setError("");
    if (!selectedTickets.length) { setError("Select at least one ticket."); return; }
    if (!form.userName.trim() || !form.userPhone.trim()) { setError("Name and phone are required."); return; }
    setLoading(true);
    try {
      await bookMultipleTickets(gameId, selectedTickets, {
        userName: form.userName.trim(),
        userPhone: form.userPhone.trim(),
      });
      onBooked?.(`✅ ${selectedTickets.length} ticket${selectedTickets.length > 1 ? "s" : ""} booked for ${form.userName}!`);
      setSelectedTickets([]);
      setForm({ userName: "", userPhone: "" });
    } catch (e) {
      setError("Booking failed: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRelease(ticketId) {
    if (!window.confirm(`Release ticket ${ticketId}? It will become available again.`)) return;
    setReleasing(ticketId);
    try {
      await releaseTicket(gameId, ticketId);
      onBooked?.(`🔓 Ticket ${ticketId} released.`);
    } catch (e) {
      alert("Failed to release: " + e.message);
    } finally {
      setReleasing(null);
    }
  }

  const canRelease = gameStatus === "waiting";

    async function handleUnfreeze(ticketId) {
    setUnfreezing(ticketId);
    try {
      await unfreezeTicket(gameId, ticketId);
      onBooked?.(`🔓 Ticket ${ticketId} is now free again.`);
    } catch (e) {
      alert("Failed to unfreeze: " + e.message);
    } finally {
      setUnfreezing(null);
    }
  }

  async function handleFreezeBook(ticket) {
    // Directly book a frozen ticket (confirm + book in one step)
    const name = ticket.frozenByName || "";
    if (!window.confirm(`Book frozen ticket ${ticket.id} and confirm it?`)) return;
    // Re-use existing book flow — admin just selects it and fills the form
    // Simpler: just unfreeze it so admin can book normally
    await handleUnfreeze(ticket.id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

      {/* ── Book tickets ── */}
      <div className="sp-section">
        <div className="sp-section-header">
          <h3 className="sp-section-title">Book Tickets</h3>
          {sortedFree.length > 0 && (
            <div className="sp-row-gap">
              <button onClick={selectAll} className="sp-link-btn">Select All</button>
              {selectedTickets.length > 0 && (
                <button onClick={clearAll} className="sp-link-btn danger">Clear</button>
              )}
            </div>
          )}
        </div>

        <div className="sp-ticket-grid">
          {sortedFree.map(t => (
            <button
              key={t.id}
              onClick={() => toggleTicket(t.id)}
              className={`ticket-pill ${selectedTickets.includes(t.id) ? "selected" : ""}`}
            >
              {t.id}
            </button>
          ))}
          {sortedFree.length === 0 && <p className="sp-empty">All tickets are booked!</p>}
        </div>

        {selectedTickets.length > 0 && (
          <>
            <div className="sp-selected-summary">
              <span className="sp-selected-count">{selectedTickets.length} selected</span>
              <span className="sp-selected-ids">{selectedTickets.join(", ")}</span>
            </div>
            <div className="sp-form">
              <input
                className="admin-input"
                placeholder="User name *"
                value={form.userName}
                onChange={e => setForm(f => ({ ...f, userName: e.target.value }))}
              />
              <input
                className="admin-input"
                placeholder="Phone number *"
                value={form.userPhone}
                onChange={e => setForm(f => ({ ...f, userPhone: e.target.value }))}
              />
              {error && <p className="error-msg">{error}</p>}
              <button onClick={handleBook} disabled={loading} className="admin-btn primary sp-full-btn">
                {loading ? "Booking…" : `Confirm Booking (${selectedTickets.length} ticket${selectedTickets.length > 1 ? "s" : ""})`}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Booked tickets ── */}
      {players.length > 0 && (
        <div className="sp-section">
          <div className="sp-section-header">
            <h3 className="sp-section-title">Booked Tickets</h3>
            <span className="sp-count-badge">{bookedTickets.length}</span>
          </div>

          {canRelease && (
            <p className="hint" style={{ marginBottom: 12, color: "var(--accent2)" }}>
              🔓 You can release tickets while the game is in <strong>waiting</strong> status.
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {players.map(player => {
              const av = avatarColor(player.userName);
              return (
                <div key={player.userPhone} className="sp-player-row">
                  <div className="sp-avatar" style={{ background: av.bg, color: av.color }}>
                    {initials(player.userName)}
                  </div>
                  <div className="sp-player-info">
                    <span className="sp-player-name">{player.userName}</span>
                    <span className="sp-player-meta">
                      {player.userPhone} &nbsp;·&nbsp; {player.tickets.join(", ")}
                    </span>
                  </div>
                  {canRelease && (
                    <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                      {player.tickets.map(tid => (
                        <button
                          key={tid}
                          className="admin-btn danger"
                          style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                          disabled={releasing === tid}
                          onClick={() => handleRelease(tid)}
                        >
                          {releasing === tid ? "…" : `Release ${tid}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}



      {/* ── Frozen tickets (WhatsApp holds) ── */}
      {frozenTickets.length > 0 && (
        <div className="sp-section">
          <div className="sp-section-header">
            <h3 className="sp-section-title">🔒 WhatsApp Holds</h3>
            <span className="sp-count-badge" style={{ background: "var(--color-background-warning)", color: "var(--color-text-warning)" }}>
              {frozenTickets.length}
            </span>
          </div>
          <p className="hint" style={{ marginBottom: 12 }}>
            These tickets are held by users who clicked "Book via WhatsApp". Book them once confirmed, or unfreeze to release them back.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {frozenTickets.map(ticket => {
              const heldMins = ticket.frozenAt
                ? Math.round((Date.now() - ticket.frozenAt) / 60000)
                : null;
              return (
                <div key={ticket.id} className="sp-player-row" style={{ borderLeft: "3px solid var(--color-border-warning)" }}>
                  <div className="sp-avatar" style={{ background: "var(--color-background-warning)", color: "var(--color-text-warning)", fontSize: "1rem" }}>
                    🔒
                  </div>
                  <div className="sp-player-info">
                    <span className="sp-player-name">{ticket.id}</span>
                    <span className="sp-player-meta">
                      Held via WhatsApp{heldMins !== null ? ` · ${heldMins}m ago` : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                    {/* Select for booking: pre-select this ticket in the book form above */}
                    <button
                      className="admin-btn primary"
                      style={{ fontSize: "0.75rem", padding: "3px 10px" }}
                      onClick={() => {
                        setSelectedTickets(prev =>
                          prev.includes(ticket.id) ? prev : [...prev, ticket.id]
                        );
                        // Scroll up to the booking form
                        document.querySelector(".sp-form")?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      ✓ Book
                    </button>
                    <button
                      className="admin-btn outline"
                      style={{ fontSize: "0.75rem", padding: "3px 10px" }}
                      disabled={unfreezing === ticket.id}
                      onClick={() => handleUnfreeze(ticket.id)}
                    >
                      {unfreezing === ticket.id ? "…" : "🔓 Release"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
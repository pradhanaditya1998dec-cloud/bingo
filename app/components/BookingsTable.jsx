"use client";
import { useState, useEffect, useMemo } from "react";
import { getAllBookings, toggleBookingPaymentStatus, markAllBookingsAsPaid } from "../lib/gameStore";
import { formatGameId } from "../lib/tambola";

function fmt(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString([], {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function BookingsTable({ currentGameId }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedGameId, setSelectedGameId] = useState("");
  const [sortField, setSortField] = useState("bookedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [updatingIds, setUpdatingIds] = useState(new Set());
  const [defaultSet, setDefaultSet] = useState(false);

  function reload() {
    setLoading(true);
    getAllBookings().then(b => {
      setBookings(b);
      setLoading(false);
    });
  }

  useEffect(() => {
    reload();
  }, []);

  // Find all unpaid ticket IDs for the selected game
  const unpaidTicketIds = useMemo(() => {
    if (!selectedGameId) return [];
    return bookings
      .filter(b => b.gameId === selectedGameId && b.paymentStatus !== "paid")
      .map(b => b.ticketId);
  }, [bookings, selectedGameId]);

  async function handleMarkAllPaid() {
    if (unpaidTicketIds.length === 0) return;
    if (window.confirm(`Are you sure you want to mark all ${unpaidTicketIds.length} unpaid bookings for this game as PAID?`)) {
      setLoading(true);
      try {
        await markAllBookingsAsPaid(selectedGameId, unpaidTicketIds);
        setBookings(prev =>
          prev.map(b =>
            b.gameId === selectedGameId && b.paymentStatus !== "paid"
              ? { ...b, paymentStatus: "paid" }
              : b
          )
        );
      } catch (e) {
        alert("Failed to update bookings: " + e.message);
      } finally {
        setLoading(false);
      }
    }
  }

  // Extract unique game IDs sorted descending so the latest game is first
  const uniqueGameIds = useMemo(() => {
    const ids = [...new Set(bookings.map(b => b.gameId))];
    return ids.sort((a, b) => b.localeCompare(a));
  }, [bookings]);

  // Set default selected game ID to currentGameId, or fallback to the latest game ID (only ONCE on load)
  useEffect(() => {
    if (defaultSet) return;

    if (currentGameId) {
      setSelectedGameId(currentGameId);
      setDefaultSet(true);
    } else if (uniqueGameIds.length > 0) {
      setSelectedGameId(uniqueGameIds[0]);
      setDefaultSet(true);
    }
  }, [uniqueGameIds, currentGameId, defaultSet]);

  const filtered = useMemo(() => {
    let list = [...bookings];
    if (selectedGameId) {
      list = list.filter(b => b.gameId === selectedGameId);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.userName.toLowerCase().includes(q) ||
        b.userPhone.includes(q) ||
        b.ticketId.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let va = a[sortField] ?? 0, vb = b[sortField] ?? 0;
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    return list;
  }, [bookings, selectedGameId, search, sortField, sortDir]);

  async function handleTogglePayment(booking) {
    const key = `${booking.gameId}_${booking.ticketId}`;
    if (updatingIds.has(key)) return;

    // Toggle local state immediately for instant response
    const currentVal = booking.paymentStatus || "unpaid";
    const nextVal = currentVal === "paid" ? "unpaid" : "paid";
    setBookings(prev =>
      prev.map(b =>
        b.gameId === booking.gameId && b.ticketId === booking.ticketId
          ? { ...b, paymentStatus: nextVal }
          : b
      )
    );

    // Track updating loading status
    setUpdatingIds(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    try {
      await toggleBookingPaymentStatus(booking.gameId, booking.ticketId, currentVal);
    } catch (e) {
      // Revert local state on error
      setBookings(prev =>
        prev.map(b =>
          b.gameId === booking.gameId && b.ticketId === booking.ticketId
            ? { ...b, paymentStatus: currentVal }
            : b
        )
      );
      alert("Failed to update payment status: " + e.message);
    } finally {
      setUpdatingIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  // Helper component for sort icon indicator
  function SortIcon({ field }) {
    if (sortField !== field) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon active">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  if (loading) return <div className="sp-loading">Loading bookings…</div>;

  return (
    <div className="sp-section">
      <div className="sp-section-header">
        <div className="sp-section-header-left">
          <h3 className="sp-section-title">All Bookings</h3>
          <span className="sp-count-badge">{filtered.length} bookings</span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {selectedGameId && (
            <button
              onClick={handleMarkAllPaid}
              disabled={loading || unpaidTicketIds.length === 0}
              className="admin-btn outline success"
              style={{ fontSize: "0.8rem", padding: "4px 12px" }}
              title="Mark all bookings for this game as Paid"
            >
              ✅ Mark All Paid ({unpaidTicketIds.length})
            </button>
          )}
          <button onClick={reload} className="admin-btn outline" style={{ fontSize: "0.8rem", padding: "4px 12px" }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <div className="sp-filters">
        <input
          className="admin-input sp-search"
          placeholder="Search name, phone, ticket…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="admin-input sp-select"
          value={selectedGameId}
          onChange={e => setSelectedGameId(e.target.value)}
          style={{ minWidth: 220 }}
        >
          {uniqueGameIds.map(id => (
            <option key={id} value={id}>
              {formatGameId(id)}
            </option>
          ))}
        </select>
        {search && (
          <button onClick={() => setSearch("")} className="sp-clear-btn">
            ✕ Clear
          </button>
        )}
      </div>

      <div className="sp-table-wrap">
        <table className="sp-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort("ticketId")} className="sortable">Ticket <SortIcon field="ticketId" /></th>
              <th onClick={() => toggleSort("userName")} className="sortable">Name <SortIcon field="userName" /></th>
              <th>Phone</th>
              <th onClick={() => toggleSort("gameId")} className="sortable">Game ID <SortIcon field="gameId" /></th>
              <th onClick={() => toggleSort("bookedAt")} className="sortable">Booked At <SortIcon field="bookedAt" /></th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b, i) => {
              const key = `${b.gameId}_${b.ticketId}`;
              const payStatus = b.paymentStatus || "unpaid";
              const isUpdating = updatingIds.has(key);

              return (
                <tr key={`${b.gameId}-${b.ticketId}-${i}`}>
                  <td data-label="Ticket"><span className="mono-chip">{b.ticketId}</span></td>
                  <td data-label="Name" className="td-name">{b.userName}</td>
                  <td data-label="Phone" className="td-phone">{b.userPhone}</td>
                  <td data-label="Game ID"><span className="mono-chip sm">{formatGameId(b.gameId)}</span></td>
                  <td data-label="Booked At" className="td-time">{fmt(b.bookedAt)}</td>
                  <td data-label="Payment">
                    <button
                      onClick={() => handleTogglePayment(b)}
                      disabled={isUpdating}
                      className={`payment-chip ${payStatus}`}
                      title="Click to toggle payment status"
                    >
                      {isUpdating ? "⏳" : payStatus === "paid" ? "✅ Paid" : "❌ Unpaid"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="td-empty">No bookings found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
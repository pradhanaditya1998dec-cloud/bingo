"use client";
import { useState, useEffect, useMemo } from "react";
import { getAllBookings } from "../lib/gameStore";

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
  const [dateFilter, setDateFilter] = useState("");
  const [sortField, setSortField] = useState("bookedAt");
  const [sortDir, setSortDir] = useState("desc");

  function reload() {
    setLoading(true);
    getAllBookings().then(b => { setBookings(b); setLoading(false); });
  }

  useEffect(() => { reload(); }, []);

  const gameDates = useMemo(() => {
    const dates = [...new Set(bookings.map(b => b.gameId.split("_")[0] || b.gameId.slice(0, 10)))];
    return dates.sort((a, b) => b.localeCompare(a));
  }, [bookings]);

  const filtered = useMemo(() => {
    let list = [...bookings];
    if (dateFilter) {
      list = list.filter(b => (b.gameId.split("_")[0] || b.gameId.slice(0, 10)) === dateFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.userName.toLowerCase().includes(q) ||
        b.userPhone.includes(q) ||
        b.ticketId.toLowerCase().includes(q) ||
        b.gameId.includes(q)
      );
    }
    list.sort((a, b) => {
      let va = a[sortField] ?? 0, vb = b[sortField] ?? 0;
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    return list;
  }, [bookings, dateFilter, search, sortField, sortDir]);

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function SortIcon({ field }) {
    if (sortField !== field) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon active">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  if (loading) return <div className="sp-loading">Loading bookings…</div>;

  return (
    <div className="sp-section">
      <div className="sp-section-header">
        <h3 className="sp-section-title">All Bookings</h3>
        <span className="sp-count-badge">{filtered.length}</span>
        <button onClick={reload} className="admin-btn outline" style={{ marginLeft: "auto", fontSize: "0.8rem", padding: "4px 12px" }}>
          ↻ Refresh
        </button>
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
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
        >
          <option value="">All Dates</option>
          {gameDates.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {(search || dateFilter) && (
          <button onClick={() => { setSearch(""); setDateFilter(""); }} className="sp-clear-btn">
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
              <th onClick={() => toggleSort("gameId")} className="sortable">Game Date <SortIcon field="gameId" /></th>
              <th onClick={() => toggleSort("bookedAt")} className="sortable">Booked At <SortIcon field="bookedAt" /></th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b, i) => (
              <tr key={`${b.gameId}-${b.ticketId}-${i}`}>
                <td><span className="mono-chip">{b.ticketId}</span></td>
                <td className="td-name">{b.userName}</td>
                <td className="td-phone">{b.userPhone}</td>
                <td><span className="mono-chip sm">{b.gameId.split("_")[0] || b.gameId.slice(0, 10)}</span></td>
                <td className="td-time">{fmt(b.bookedAt)}</td>
                <td><span className={`status-chip ${b.gameStatus}`}>{b.gameStatus}</span></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="td-empty">No bookings found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
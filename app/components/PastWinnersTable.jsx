"use client";
// app/admin/components/PastWinnersTable.jsx
import { useState, useEffect, useMemo } from "react";
import { getAllPastGames, deleteGame } from "../lib/gameStore";
import { WIN_TYPES, WIN_LABELS, formatGameId, formatGameTime } from "../lib/tambola";

export default function PastWinnersTable({ isSuperAdmin = false }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getAllPastGames().then(g => { setGames(g); setLoading(false); });
  }, []);

  async function handleDelete(gameId) {
    if (window.confirm(`Are you sure you want to permanently delete game ${gameId}? This will also delete all ticket bookings for this game.`)) {
      try {
        await deleteGame(gameId);
        setGames(prev => prev.filter(g => g.id !== gameId));
      } catch (e) {
        alert("Failed to delete game: " + e.message);
      }
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return games;
    const q = search.toLowerCase();
    return games.filter(game => {
      // Match game id or any winner's name/ticket
      if (game.id.includes(q)) return true;
      return WIN_TYPES.some(type => {
        const w = game.winners?.[type];
        if (!w) return false;
        const list = Array.isArray(w) ? w : [w];
        return list.some(winner =>
          winner.userName?.toLowerCase().includes(q) ||
          winner.ticketId?.toLowerCase().includes(q)
        );
      });
    });
  }, [games, search]);

  if (loading) return <div className="sp-loading">Loading past winners…</div>;

  return (
    <div className="sp-section">
      <div className="sp-section-header">
        <h3 className="sp-section-title">Past Games</h3>
        <span className="sp-count-badge">{filtered.length} games</span>
      </div>

      {/* Search */}
      <div className="sp-filters">
        <input
          className="admin-input sp-search"
          placeholder="Search name, ticket or game…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="sp-table-wrap">
        <table className="sp-table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Numbers Called</th>
              {WIN_TYPES.map(type => (
                <th key={type}>{WIN_LABELS[type]}</th>
              ))}
              {isSuperAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((game) => (
              <tr key={game.id}>
                <td data-label="Date & Time"><span className="mono-chip sm">{formatGameTime(game.startedAt, game.id)}</span></td>
                <td data-label="Numbers Called" className="td-center">{game.calledNumbers?.length || 0}</td>
                {WIN_TYPES.map(type => {
                  const w = game.winners?.[type];
                  if (!w) return <td key={type} data-label={WIN_LABELS[type]} className="td-empty-cell">—</td>;
                  const list = Array.isArray(w) ? w : [w];
                  return (
                    <td key={type} data-label={WIN_LABELS[type]}>
                      {list.map((winner, i) => (
                        <div key={i} className="winner-cell">
                          <span className="td-name">{winner.userName}</span>
                          <span className="mono-chip sm">{winner.ticketId}</span>
                        </div>
                      ))}
                    </td>
                  );
                })}
                {isSuperAdmin && (
                  <td data-label="Actions">
                    <button
                      onClick={() => handleDelete(game.id)}
                      className="action-delete-btn"
                      title="Delete Game"
                    >
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="13" height="13" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span style={{ marginLeft: '4px', verticalAlign: 'middle' }}>Delete</span>
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={2 + WIN_TYPES.length + (isSuperAdmin ? 1 : 0)} className="td-empty">No games found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
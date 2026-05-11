"use client";
// app/admin/components/PastWinnersTable.jsx
import { useState, useEffect, useMemo } from "react";
import { getAllPastGames } from "../lib/gameStore";
import { WIN_TYPES, WIN_LABELS, formatGameId } from "../lib/tambola";

export default function PastWinnersTable() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getAllPastGames().then(g => { setGames(g); setLoading(false); });
  }, []);

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
        <h3 className="sp-section-title">Past Winners</h3>
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
            </tr>
          </thead>
          <tbody>
            {filtered.map((game) => (
              <tr key={game.id}>
                <td><span className="mono-chip sm">{formatGameId(game.id)}</span></td>
                <td className="td-center">{game.calledNumbers?.length || 0}</td>
                {WIN_TYPES.map(type => {
                  const w = game.winners?.[type];
                  if (!w) return <td key={type} className="td-empty-cell">—</td>;
                  const list = Array.isArray(w) ? w : [w];
                  return (
                    <td key={type}>
                      {list.map((winner, i) => (
                        <div key={i} className="winner-cell">
                          <span className="td-name">{winner.userName}</span>
                          <span className="mono-chip sm">{winner.ticketId}</span>
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={2 + WIN_TYPES.length} className="td-empty">No games found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
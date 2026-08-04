"use client";
import { useState, useEffect, useMemo } from "react";
import { getAllGames, updateGameTicketPrice } from "../lib/gameStore";
import { formatGameId, WIN_LABELS } from "../lib/tambola";

function formatTimeOnly(gameId) {
  if (!gameId) return "";
  const [_, timePart] = gameId.split("_");
  if (!timePart) return "";
  const [h, mn] = timePart.split("-").map(Number);
  if (isNaN(h) || isNaN(mn)) return timePart;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(mn).padStart(2, "0")} ${ampm}`;
}

export default function ProfitTab({ isSuperAdmin = false }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsEditingPrice(false);
    setNewPrice("");
  }, [selectedGameId]);

  const handleSavePrice = async () => {
    const priceNum = parseFloat(newPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      alert("Please enter a valid ticket price (>= 0)");
      return;
    }
    setIsSaving(true);
    try {
      await updateGameTicketPrice(selectedGameId, priceNum);
      setGames(prevGames => prevGames.map(g => {
        if (g.id === selectedGameId) {
          return { ...g, ticketPrice: priceNum };
        }
        return g;
      }));
      setIsEditingPrice(false);
    } catch (e) {
      console.error(e);
      alert("Failed to update ticket price: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };


  useEffect(() => {
    getAllGames().then(g => {
      setGames(g);
      setLoading(false);
      if (g.length > 0) {
        setSelectedGameId(g[0].id); // default to the latest game
      }
    });
  }, []);

  const selectedGame = useMemo(() => {
    return games.find(g => g.id === selectedGameId) || null;
  }, [games, selectedGameId]);

  const [selectedDate, setSelectedDate] = useState("");

  const groupedGames = useMemo(() => {
    const groups = {};
    const sortedGames = [...games].sort((a, b) => b.id.localeCompare(a.id));
    
    sortedGames.forEach(g => {
      const [datePart] = g.id.split("_");
      const [y, m, d] = datePart.split("-").map(Number);
      const dateStr = isNaN(y) ? "Other Games" : new Date(y, m - 1, d).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
      
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(g);
    });
    
    return Object.entries(groups);
  }, [games]);

  const dateOptions = useMemo(() => {
    return groupedGames.map(([dateStr]) => dateStr);
  }, [groupedGames]);

  useEffect(() => {
    if (groupedGames.length > 0) {
      const dates = groupedGames.map(([dateStr]) => dateStr);
      if (!selectedDate || !dates.includes(selectedDate)) {
        setSelectedDate(groupedGames[0][0]);
      }
    }
  }, [groupedGames, selectedDate]);

  // Lifetime Stats Calculations
  const lifetimeStats = useMemo(() => {
    let totalRevenue = 0;
    let totalPrizes = 0;
    let totalProfit = 0;
    let totalCashProfit = 0;
    let totalBookings = 0;

    games.forEach(g => {
      const ticketPrice = Number(g.ticketPrice) || 0;
      const tickets = g.tickets || {};
      const bookedTickets = Object.values(tickets).filter(t => t.status === "booked");
      const bookedCount = bookedTickets.length;
      const paidCount = bookedTickets.filter(t => t.paymentStatus === "paid").length;

      const gameRevenue = bookedCount * ticketPrice;
      const gameCashRevenue = paidCount * ticketPrice;

      // Prize pool
      const prizes = g.prizes || {};
      const rules = g.rules || {};
      let gamePrizePool = 0;
      Object.entries(prizes).forEach(([key, amount]) => {
        const isEnabled = key === "fullHouse" ? true : !!rules[key];
        if (isEnabled) {
          gamePrizePool += Number(amount) || 0;
        }
      });

      totalRevenue += gameRevenue;
      totalPrizes += gamePrizePool;
      totalProfit += (gameRevenue - gamePrizePool);
      totalCashProfit += (gameCashRevenue - gamePrizePool);
      totalBookings += bookedCount;
    });

    return {
      totalRevenue,
      totalPrizes,
      totalProfit,
      totalCashProfit,
      totalBookings
    };
  }, [games]);

  // Selected Game Financial calculations
  const stats = useMemo(() => {
    if (!selectedGame) return null;

    const ticketPrice = Number(selectedGame.ticketPrice) || 0;
    const tickets = selectedGame.tickets || {};
    const bookedTickets = Object.values(tickets).filter(t => t.status === "booked");
    
    const totalBooked = bookedTickets.length;
    const totalPaid = bookedTickets.filter(t => t.paymentStatus === "paid").length;
    const totalUnpaid = totalBooked - totalPaid;

    const totalRevenue = totalBooked * ticketPrice;
    const realizedRevenue = totalPaid * ticketPrice;
    const pendingRevenue = totalUnpaid * ticketPrice;

    // Calculate configured prize pool cost
    const prizes = selectedGame.prizes || {};
    const rules = selectedGame.rules || {};

    const prizeBreakdown = Object.entries(prizes).map(([key, amount]) => {
      const isEnabled = key === "fullHouse" ? true : !!rules[key];
      return {
        key,
        label: WIN_LABELS[key] || key,
        amount: Number(amount) || 0,
        enabled: isEnabled
      };
    });

    const totalPrizePool = prizeBreakdown
      .filter(p => p.enabled)
      .reduce((sum, p) => sum + p.amount, 0);

    const estProfit = totalRevenue - totalPrizePool;
    const realizedProfit = realizedRevenue - totalPrizePool;

    return {
      ticketPrice,
      totalBooked,
      totalPaid,
      totalUnpaid,
      totalRevenue,
      realizedRevenue,
      pendingRevenue,
      totalPrizePool,
      estProfit,
      realizedProfit,
      prizeBreakdown
    };
  }, [selectedGame]);

  if (loading) return <div className="sp-loading">Loading financial data…</div>;
  if (games.length === 0) return <div className="sp-loading">No games created yet. Create a game to view pricing and profit data!</div>;

  return (
    <div className="sp-section">
      {/* Lifetime Performance Card */}
      <div className="lifetime-summary-card">
        <h4 className="lifetime-title">💼 Lifetime Finance Summary</h4>
        <div className="lifetime-stats-grid">
          <div className="lifetime-stat">
            <span className="lifetime-label">Total Bookings</span>
            <span className="lifetime-value">{lifetimeStats.totalBookings} tickets</span>
          </div>
          <div className="lifetime-stat">
            <span className="lifetime-label">Total Revenue</span>
            <span className="lifetime-value text-green">₹{lifetimeStats.totalRevenue}</span>
          </div>
          <div className="lifetime-stat">
            <span className="lifetime-label">Total Payouts</span>
            <span className="lifetime-value text-red">₹{lifetimeStats.totalPrizes}</span>
          </div>
          <div className="lifetime-stat">
            <span className="lifetime-label">Net Profit Till Date</span>
            <span className={`lifetime-value ${lifetimeStats.totalProfit >= 0 ? "text-green" : "text-red"}`}>
              {lifetimeStats.totalProfit >= 0 ? "+" : ""}₹{lifetimeStats.totalProfit}
            </span>
          </div>
        </div>
      </div>

      {/* ── Day-wise Games List ── */}
      <div className="day-wise-games-container">
        
        {/* Date Filter Dropdown Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", flexWrap: "wrap", gap: "12px" }}>
          <h4 style={{ fontSize: "1.1rem", fontWeight: "700", color: "var(--text)", margin: 0 }}>📅 Games Day-Wise</h4>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "600" }}>Select Date:</span>
            <select
              className="admin-input"
              value={selectedDate}
              onChange={e => {
                const newDate = e.target.value;
                setSelectedDate(newDate);
                // Also automatically select the latest game on that date!
                const dayGroup = groupedGames.find(([dateStr]) => dateStr === newDate);
                if (dayGroup && dayGroup[1].length > 0) {
                  const sortedList = [...dayGroup[1]].sort((a, b) => a.id.localeCompare(b.id));
                  setSelectedGameId(sortedList[sortedList.length - 1].id);
                }
              }}
              style={{ minWidth: "160px", padding: "6px 12px", height: "36px", cursor: "pointer" }}
            >
              {dateOptions.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Display selected date group only */}
        {(() => {
          const activeDayGroup = groupedGames.find(([dateStr]) => dateStr === selectedDate);
          if (!activeDayGroup) return null;
          const [dateStr, gameList] = activeDayGroup;
          const sortedList = [...gameList].sort((a, b) => a.id.localeCompare(b.id));

          return (
            <div key={dateStr} className="day-group">
              <h5 className="day-group-title">
                {dateStr}
              </h5>
              
              <div className="day-group-games-list">
                {sortedList.map((g, idx) => {
                  const ticketPrice = Number(g.ticketPrice) || 0;
                  const bookedCount = Object.values(g.tickets || {}).filter(t => t.status === "booked").length;
                  const rev = bookedCount * ticketPrice;
                  
                  // Prizes
                  const prizes = g.prizes || {};
                  const rules = g.rules || {};
                  let pz = 0;
                  Object.entries(prizes).forEach(([key, amount]) => {
                    const isEnabled = key === "fullHouse" ? true : !!rules[key];
                    if (isEnabled) pz += Number(amount) || 0;
                  });
                  const prof = rev - pz;
                  
                  const isSelected = g.id === selectedGameId;
                  const timeStr = formatTimeOnly(g.id);

                  return (
                    <div
                      key={g.id}
                      onClick={() => setSelectedGameId(g.id)}
                      className={`day-group-game-item ${isSelected ? "selected" : ""}`}
                    >
                      <div className="game-item-left">
                        <span className="game-item-title">
                          Game {idx + 1}
                        </span>
                        <span className="game-item-time">
                          ({timeStr})
                        </span>
                        <span className={`status-chip ${g.status}`} style={{ fontSize: "0.68rem", padding: "2px 6px" }}>
                          {g.status}
                        </span>
                      </div>
                      
                      <div className="game-item-right">
                        <span>🎟️ {bookedCount} booked</span>
                        <span>💰 Rev: ₹{rev}</span>
                        <span className="game-item-profit" style={isSelected ? {} : { color: (prof >= 0 ? "#10b981" : "#ef4444") }}>
                          📈 Profit: ₹{prof}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {selectedGame && stats && (
        <div style={{ borderTop: "1px dashed var(--border)", paddingTop: "24px", marginTop: "24px" }}>
          <div className="sp-section-header" style={{ marginBottom: "20px" }}>
            <div className="sp-section-header-left">
              <h3 className="sp-section-title">📊 Financial Breakdown</h3>
              <span className={`status-chip ${selectedGame.status}`}>
                {selectedGame.status}
              </span>
            </div>
            <span style={{ fontSize: "0.85rem", opacity: 0.6, fontWeight: "600" }}>
              ID: {selectedGame.id}
            </span>
          </div>

          <div className="financials-dashboard">
          {/* Key Metrics Grid */}
          <div className="metrics-grid">
            <div className="metric-card" style={{ position: "relative" }}>
              <span className="metric-label">Ticket Price</span>
              {isEditingPrice ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                  <input
                    type="number"
                    className="admin-input"
                    value={newPrice}
                    onChange={e => setNewPrice(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      fontSize: "1rem",
                      height: "30px",
                      boxSizing: "border-box"
                    }}
                    placeholder="Enter price"
                    min="0"
                    step="any"
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={handleSavePrice}
                      disabled={isSaving}
                      style={{
                        flex: 1,
                        padding: "4px 8px",
                        fontSize: "0.75rem",
                        background: "#10b981",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontWeight: "600",
                        opacity: isSaving ? 0.7 : 1
                      }}
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => setIsEditingPrice(false)}
                      style={{
                        flex: 1,
                        padding: "4px 8px",
                        fontSize: "0.75rem",
                        background: "var(--border)",
                        color: "var(--text)",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontWeight: "600"
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="metric-value">₹{stats.ticketPrice}</span>
                  {isSuperAdmin && (
                    <button
                      onClick={() => {
                        setNewPrice(stats.ticketPrice);
                        setIsEditingPrice(true);
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-muted)",
                        transition: "color 0.2s"
                      }}
                      title="Edit Ticket Price"
                      onMouseEnter={e => e.currentTarget.style.color = "var(--text)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
            
            <div className="metric-card">
              <span className="metric-label">Tickets Booked</span>
              <span className="metric-value">{stats.totalBooked}</span>
              <span className="metric-sub">
                {stats.totalPaid} Paid · {stats.totalUnpaid} Unpaid
              </span>
            </div>

            <div className="metric-card success">
              <span className="metric-label">Total Revenue</span>
              <span className="metric-value">₹{stats.totalRevenue}</span>
              <span className="metric-sub">
                ₹{stats.realizedRevenue} collected · ₹{stats.pendingRevenue} pending
              </span>
            </div>

            <div className="metric-card danger">
              <span className="metric-label">Total Prize Pool</span>
              <span className="metric-value text-red">₹{stats.totalPrizePool}</span>
              <span className="metric-sub">Guaranteed payouts</span>
            </div>
          </div>

          {/* Profit summary banner */}
          <div className={`profit-summary-box ${stats.estProfit >= 0 ? "positive" : "negative"}`}>
            <div className="profit-summary-title">
              {stats.estProfit >= 0 ? "📈 Estimated Profit" : "📉 Estimated Loss"}
            </div>
            <div className="profit-summary-value">
              {stats.estProfit >= 0 ? "+" : ""}₹{stats.estProfit}
            </div>
            <p className="profit-summary-desc">
              Based on overall bookings. Your current cash profit (paid bookings only) is{" "}
              <strong>
                {stats.realizedProfit >= 0 ? "+" : ""}₹{stats.realizedProfit}
              </strong>.
            </p>
          </div>

          {/* Breakdown cards */}
          <div className="breakdown-grid">
            
            {/* Prize pool details */}
            <div className="breakdown-card">
              <h4 className="breakdown-title">Prize Payouts Breakdown</h4>
              <div className="breakdown-list">
                {stats.prizeBreakdown.map(p => (
                  <div key={p.key} className={`breakdown-item ${!p.enabled ? "disabled" : ""}`}>
                    <span className="item-label">
                      {p.label} {!p.enabled && <span className="disabled-tag">(Disabled)</span>}
                    </span>
                    <span className="item-value">
                      {p.enabled ? `₹${p.amount}` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Income details */}
            <div className="breakdown-card">
              <h4 className="breakdown-title">Revenue & Cashflow Status</h4>
              <div className="breakdown-list">
                <div className="breakdown-item">
                  <span className="item-label">Paid Tickets ({stats.totalPaid})</span>
                  <span className="item-value text-green">₹{stats.realizedRevenue}</span>
                </div>
                
                <div className="breakdown-item">
                  <span className="item-label">Unpaid Tickets ({stats.totalUnpaid})</span>
                  <span className="item-value text-orange">₹{stats.pendingRevenue}</span>
                </div>
                
                <div className="breakdown-item divider">
                  <span className="item-label font-bold">Total Bookings ({stats.totalBooked})</span>
                  <span className="item-value font-bold">₹{stats.totalRevenue}</span>
                </div>

                <div className="breakdown-item text-muted" style={{ fontSize: '0.75rem', marginTop: 10 }}>
                  * Cashflow represents the actual income collected vs pending. Please update payment statuses in the "All Bookings" tab to convert pending amounts into realized profit.
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
      )}
    </div>
  );
}

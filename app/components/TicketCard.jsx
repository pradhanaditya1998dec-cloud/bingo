"use client";
// components/TicketCard.jsx
import { reconstructGrid } from "../lib/tambola";

const ADMIN_PHONE = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || "917628863362";

export default function TicketCard({
  ticket,
  calledNumbers,
  gameStatus,
  colorIndex = 0,
  // Multi-select props (public page)
  selectable = false,
  isSelected = false,
  onToggleSelect,
  // Static display (winners page)
  staticDisplay = false,
}) {
  const called = new Set(calledNumbers || []);
  const isBooked = ticket.status === "booked";
  const isFrozen = ticket.status === "frozen";
  const canBook = gameStatus === "waiting" && !isBooked && !selectable;
  const grid = Array.isArray(ticket.numbers[0])
    ? ticket.numbers
    : reconstructGrid(ticket.numbers);

  const colorClass = `ticket-color-${colorIndex % 6}`;

  function handleCardClick() {
    if (selectable && !isBooked && gameStatus === "waiting") {
      onToggleSelect?.(ticket.id);
    }
  }

  return (
   <div
  className={`ticket-card ${isBooked ? "booked" : isFrozen ? "frozen" : "free"} ${gameStatus === "waiting" ? "waiting" : "live"} ${colorClass} ${selectable && !isBooked && !isFrozen ? "selectable" : ""} ${isSelected ? "selected-ticket" : ""} ${staticDisplay ? "static-display" : ""}`}
  onClick={handleCardClick}
>
      {/* Selection indicator */}
      {/* {isSelected && (
        <div className="select-check">✓</div>
      )} */}

      {/* Header */}
      <div className="ticket-header">
        <span className="ticket-id">{ticket.id} {isBooked && <span className="ticket-badge booked-badge ">Booked ✓</span>}</span>
        {isBooked ? (
          <span className="ticket-owner">👤 {ticket.userName}</span>
        ) : isSelected ? (
          <span className="ticket-badge selected-badge">Selected ✓</span>
        ) : (
          <span className="ticket-badge free-badge">Available</span>
        )}
      </div>

      {/* Number Grid */}
      <div className="ticket-grid">
        {grid.map((row, ri) => (
          <div key={ri} className="ticket-row">
            {row.map((num, ci) => (
              <div
                key={ci}
                className={`ticket-cell ${num === null ? "blank" :
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



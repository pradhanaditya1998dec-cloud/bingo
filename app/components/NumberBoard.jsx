"use client";
// components/NumberBoard.jsx

const BALL_COLORS = [
  { bg: "#e53935", shadow: "#ff6b6b" }, // 1–9   red
  { bg: "#1976d2", shadow: "#64b5f6" }, // 10–19 blue
  { bg: "#388e3c", shadow: "#81c784" }, // 20–29 green
  { bg: "#f57c00", shadow: "#ffb74d" }, // 30–39 orange
  { bg: "#7b1fa2", shadow: "#ce93d8" }, // 40–49 purple
  { bg: "#00838f", shadow: "#4dd0e1" }, // 50–59 teal
  { bg: "#c62828", shadow: "#ef9a9a" }, // 60–69 dark red
  { bg: "#1565c0", shadow: "#90caf9" }, // 70–79 dark blue
  { bg: "#2e7d32", shadow: "#a5d6a7" }, // 80–90 dark green
];

function getBallColor(n) {
  const bucket = n === 90 ? 8 : Math.floor((n - 1) / 10);
  return BALL_COLORS[Math.min(bucket, 8)];
}

export default function NumberBoard({
  calledNumbers = [],
  interactive = false,
  onPickNumber,
}) {
  const called = new Set(calledNumbers);
  const last = calledNumbers[calledNumbers.length - 1];
  // Last 6 numbers in reverse order (most recent first)
  const recent = [...calledNumbers].reverse().slice(0, 4);

  function handleClick(n) {
    if (!interactive || called.has(n)) return;
    onPickNumber?.(n);
  }

  return (
    <div className="nb-wrapper">
      {/* ── Left panel: current + recent ── */}
      <div className="nb-left">
        {/* Current number */}
        <div className="nb-current-label">
          <span className="nb-star">★</span>
          CURRENT
          <span className="nb-star">★</span>
        </div>

        <div className="nb-current-box">
          {last !== undefined ? (
            <span className="nb-current-num">{last}</span>
          ) : (
            <span className="nb-current-empty">—</span>
          )}
          {last !== undefined && <div className="nb-current-glow" />}
        </div>

        {/* Recent numbers */}
        <div className="nb-recent-label">
          <span className="nb-dash">—</span>
          RECENT
          <span className="nb-dash">—</span>
        </div>

        <div className="nb-recent-list">
          {recent.map((n) => {
            const c = getBallColor(n);
            return (
              <div
                key={n}
                className="nb-recent-ball"
                style={{ "--rc": c.bg, "--rs": c.shadow }}
              >
                {n}
              </div>
            );
          })}
          {recent.length === 0 && (
            <p className="nb-no-recent">No numbers called yet</p>
          )}
        </div>

        <div className="nb-total-called">
          <span className="nb-total-num">{calledNumbers.length}</span>
          <span className="nb-total-label">/ 90 called</span>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="nb-divider" />

      {/* ── Right panel: number grid ── */}
      <div className="nb-right">
        <div className="nb-grid-title">
          <span className="nb-title-line" />
          NUMBER BOARD (1 – 90)
          <span className="nb-title-line" />
        </div>

        {interactive && (
          <p className="nb-interactive-hint">Click any number to call it · or use Auto Draw</p>
        )}

        <div className="nb-grid">
          {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => {
            const isCalled = called.has(n);
            const isLatest = n === last;
            const clickable = interactive && !isCalled;
            const c = getBallColor(n);

            return (
              <div
                key={n}
                onClick={() => handleClick(n)}
                title={clickable ? `Call ${n}` : ""}
                className={`nb-cell${isCalled ? " nb-called" : ""}${isLatest ? " nb-latest" : ""}${clickable ? " nb-pickable" : ""}`}
                style={{
                  "--cc": c.bg,
                  "--cs": c.shadow,
                }}
              >
                {n}
                {isCalled && !isLatest && <div className="nb-slash" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
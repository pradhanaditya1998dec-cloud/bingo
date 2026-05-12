"use client";
// app/admin/components/ConfirmModal.jsx

export default function ConfirmModal({ open, title, message, confirmLabel = "Confirm", danger = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel} className="admin-btn outline">Cancel</button>
          <button onClick={onConfirm} className={`admin-btn ${danger ? "danger" : "primary"}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
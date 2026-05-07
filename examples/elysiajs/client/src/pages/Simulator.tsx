import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "../store";
import { fmt, statusCls, SIMULATOR_URL } from "../api";

export function Simulator() {
  const { id: focusId } = useParams<{ id: string }>();
  const { allOrders, loading, fetchAllOrders, simulateSettle, refreshStatus } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(focusId ?? null);

  useEffect(() => {
    fetchAllOrders();
  }, [fetchAllOrders]);

  useEffect(() => {
    if (focusId) setSelectedId(focusId);
  }, [focusId]);

  const focusOrder = allOrders.find(o => o.id === selectedId) ?? null;
  const payment = focusOrder?.payment;

  const handleMarkPaid = async () => {
    if (!focusOrder) return;
    try {
      await simulateSettle(focusOrder.id);
      alert("✅ Pembayaran berhasil disimulasikan!");
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Error"); }
  };

  return (
    <>
      <div className="topbar">
        <h1>🦕 QRIS Saurus</h1>
        <span className="badge">Simulator</span>
        <Link to="/" className="badge">🏪 POS</Link>
      </div>

      <div className="sim-page">
        <div className="sim-grid">
          <div>
            <div className="card">
              <h2>📋 Transactions</h2>
              {allOrders.length === 0 ? (
                <p className="muted">Belum ada transaksi. <Link to="/" style={{ color: "#38bdf8" }}>Buat order di POS</Link>.</p>
              ) : (
                allOrders.map(o => (
                  <div
                    key={o.id}
                    className={`tx-row${selectedId === o.id ? " active" : ""}`}
                    onClick={() => setSelectedId(o.id)}
                  >
                    <div>
                      <div className="tx-id">{o.id}</div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {o.payment ? `${o.payment.provider} / ${o.payment.mode}` : "no payment"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="tx-amount">{fmt(o.total)}</div>
                      <span className={`status ${statusCls(o.status)}`}>{o.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            {focusOrder && payment ? (
              <div className="card">
                <h2>⚡ Simulasi Pembayaran</h2>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{focusOrder.id}</div>
                  <div>Amount: <strong style={{ color: "#38bdf8" }}>{fmt(focusOrder.total)}</strong></div>
                  <div style={{ marginTop: 6 }}>
                    Status: <span className={`status ${statusCls(focusOrder.status)}`}>{focusOrder.status}</span>
                  </div>
                </div>

                {(payment.qrImageUrl || payment.qrDataUrl) && (
                  <img
                    src={payment.qrImageUrl || payment.qrDataUrl}
                    alt="QR Code"
                    style={{ maxWidth: 240, display: "block", margin: "0 auto 12px", borderRadius: 12, border: "1px solid #334155" }}
                  />
                )}

                {payment.qrImageUrl && (
                  <>
                    <p className="muted" style={{ marginBottom: 4 }}>QR Image URL:</p>
                    <div className="copy-box">
                      <input value={payment.qrImageUrl} readOnly />
                      <button onClick={() => navigator.clipboard.writeText(payment.qrImageUrl!).then(() => alert("Copied!"))}>
                        📋
                      </button>
                    </div>
                  </>
                )}

                <ol className="sim-steps" style={{ margin: "16px 0" }}>
                  <li>Copy QR Image URL di atas</li>
                  <li>Buka <a href={SIMULATOR_URL} target="_blank" rel="noreferrer" style={{ color: "#38bdf8" }}>Midtrans Sandbox Simulator</a></li>
                  <li>Paste URL, lalu klik <strong>Pay</strong></li>
                  <li>Kembali ke sini dan klik <strong>Refresh Status</strong></li>
                </ol>

                <a href={SIMULATOR_URL} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ marginBottom: 8 }}>
                  🔗 Buka Midtrans Simulator
                </a>
                <button className="btn btn-success" onClick={handleMarkPaid} disabled={loading === "settle" || focusOrder.status !== "pending"}>
                  {loading === "settle" ? "⏳ Processing..." : "✅ Mark as Paid (Dev)"}
                </button>
                <button className="btn btn-ghost" onClick={() => refreshStatus(focusOrder.id)} disabled={loading === "refresh"}>
                  {loading === "refresh" ? "⏳..." : "🔄 Refresh Status"}
                </button>
              </div>
            ) : focusOrder && !payment ? (
              <div className="card">
                <h2>Order: {focusOrder.id}</h2>
                <p className="muted">Order ini belum memiliki payment. <Link to="/" style={{ color: "#38bdf8" }}>Generate QRIS di POS</Link>.</p>
              </div>
            ) : (
              <div className="card">
                <p className="muted">
                  Pilih order dari daftar, atau <Link to="/" style={{ color: "#38bdf8" }}>buat order baru di POS</Link>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

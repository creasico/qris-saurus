import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { fmt, statusCls, SIMULATOR_URL } from "../api";

export function POS() {
  const {
    products, cart, customerEmail, currentOrder, loading,
    fetchProducts, updateCart, setCustomerEmail, createOrder,
    createPayment, refreshStatus, cancelPayment, expirePayment, refundPayment,
    resetPOS
  } = useStore();

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const cartEntries = Object.entries(cart);
  const cartTotal = cartEntries.reduce((sum, [id, qty]) => {
    const p = products.find(x => x.id === id);
    return sum + (p ? p.price * qty : 0);
  }, 0);

  const payment = currentOrder?.payment;
  const qrUrl = payment?.qrImageUrl || payment?.qrDataUrl;

  const handlePay = async () => {
    await createPayment();
    dialogRef.current?.showModal();
  };

  return (
    <>
      <div className="topbar">
        <h1>🦕 QRIS Saurus</h1>
        <span className="badge">POS Terminal</span>
        <Link to="/simulate" className="badge">📋 Transactions</Link>
        <button className="badge" style={{ border: "none", cursor: "pointer" }} onClick={resetPOS}>🧹 Reset</button>
      </div>
      <div className="wrap">
        <div className="grid">
          <div>
            <div className="card">
              <h2>Menu</h2>
              <div className="products">
                {products.map(p => {
                  const qty = cart[p.id] || 0;
                  return (
                    <div key={p.id} className={`p-card${qty > 0 ? " selected" : ""}`}>
                      <div className="emoji">{p.emoji}</div>
                      <div className="name">{p.name}</div>
                      <div className="desc">{p.description}</div>
                      <div className="price">{fmt(p.price)}</div>
                      <div className="qty-row">
                        <button className="qty-btn" onClick={() => updateCart(p.id, -1)}>−</button>
                        <span className="qty-val">{qty}</span>
                        <button className="qty-btn" onClick={() => updateCart(p.id, 1)}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <div className="card">
              <h2>Customer</h2>
              <input
                placeholder="Email (opsional)"
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
              />
            </div>

            <div className="card">
              <h2>Cart</h2>
              {cartEntries.length === 0 ? (
                <p className="muted">Pilih produk dari menu.</p>
              ) : (
                <>
                  {cartEntries.map(([id, qty]) => {
                    const p = products.find(x => x.id === id);
                    if (!p) return null;
                    return (
                      <div key={id} className="order-item">
                        <span>{p.emoji} {p.name} x{qty}</span>
                        <span>{fmt(p.price * qty)}</span>
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#38bdf8", marginTop: 10 }}>
                    {fmt(cartTotal)}
                  </div>
                </>
              )}
              <div className="sep" />
              <button className="btn btn-primary" onClick={createOrder} disabled={!!loading}>
                {loading === "order" ? "⏳ Creating..." : "🛒 Buat Order"}
              </button>
            </div>

            {currentOrder && (
              <div className="card">
                <h2>Order</h2>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{currentOrder.id}</div>
                <div className="order-item">
                  <span>Total</span>
                  <span style={{ color: "#38bdf8", fontWeight: 700 }}>{fmt(currentOrder.total)}</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  Status: <span className={`status ${statusCls(currentOrder.status)}`}>{currentOrder.status}</span>
                </div>
                <div className="sep" />
                {currentOrder.status === "pending" && (
                  <button className="btn btn-success" onClick={handlePay} disabled={!!loading}>
                    {loading === "payment" ? "⏳ Generating..." : "💳 Generate QRIS"}
                  </button>
                )}
                <button className="btn btn-ghost" onClick={() => refreshStatus()} disabled={!!loading}>
                  {loading === "refresh" ? "⏳..." : "🔄 Refresh Status"}
                </button>
                {payment?.mode === "midtrans" && (
                  <>
                    <div className="sep" />
                    <button className="btn btn-ghost" style={{ color: "#fca5a5", borderColor: "#7f1d1d" }} onClick={cancelPayment}>Batalkan</button>
                    <button className="btn btn-ghost" style={{ color: "#fdba74", borderColor: "#78350f" }} onClick={expirePayment}>Expire</button>
                    <button className="btn btn-ghost" style={{ color: "#a5b4fc", borderColor: "#312e81" }} onClick={() => {
                      const a = prompt("Amount?"); if (a) refundPayment(Number(a));
                    }}>Refund</button>
                  </>
                )}
              </div>
            )}

            {payment && (
              <div className="card">
                <h2>Payment</h2>
                <div><strong>{payment.provider}</strong> / {payment.mode}</div>
                <div style={{ margin: "6px 0" }}>
                  Status: <span className={`status ${statusCls(payment.status)}`}>{payment.status}</span>
                </div>
                <div className="muted">Amount: {fmt(payment.amount)}</div>
                <div className="sep" />
                <button className="btn btn-ghost" onClick={() => dialogRef.current?.showModal()}>📱 Tampilkan QR</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <dialog ref={dialogRef}>
        <h2>Scan to Pay</h2>
        {currentOrder && payment && (
          <>
            <div className="muted" style={{ textAlign: "center" }}>
              <strong>{currentOrder.id}</strong><br />
              {fmt(payment.amount)} — <span className={`status ${statusCls(payment.status)}`}>{payment.status}</span>
            </div>
            {qrUrl && <img src={qrUrl} alt="QR Code" />}
            <p className="muted" style={{ textAlign: "center", margin: "8px 0 4px" }}>
              QR Image URL (copy untuk simulator):
            </p>
            <div className="copy-box">
              <input value={payment.qrImageUrl || "(local QR)"} readOnly />
              <button onClick={() => navigator.clipboard.writeText(payment.qrImageUrl || "").then(() => alert("Copied!"))}>
                📋
              </button>
            </div>
            <a href={SIMULATOR_URL} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ marginBottom: 8 }}>
              🔗 Buka Midtrans Simulator
            </a>
            <Link to={`/orders/${currentOrder.id}/payments/qris/simulate`} className="btn btn-success" style={{ marginBottom: 8 }}>
              ⚡ Halaman Simulasi
            </Link>
          </>
        )}
        <button className="btn btn-ghost" style={{ marginBottom: 8 }} onClick={() => refreshStatus()}>🔄 Refresh Status</button>
        <button className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Tutup</button>
      </dialog>
    </>
  );
}

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { POS } from "./pages/POS";
import { Simulator } from "./pages/Simulator";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<POS />} />
        <Route path="/simulate" element={<Simulator />} />
        <Route path="/orders/:id/payments/qris/simulate" element={<Simulator />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

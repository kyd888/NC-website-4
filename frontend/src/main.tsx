import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider, useParams } from "react-router-dom";
// Base styles first, shared site chrome second — site.css must win ties (e.g. .container padding).
import "./index.css";
import "./site.css";
import App from "./App";
import AdminApp from "./admin/AdminApp";
import Gateway from "./pages/Gateway";
import Events from "./pages/Events";
import KydMusic from "./pages/kyd/KydMusic";
import KydProject from "./pages/kyd/KydProject";
import KydLive from "./pages/kyd/KydLive";
import KydVisuals from "./pages/kyd/KydVisuals";
import KydInfo from "./pages/kyd/KydInfo";

/**
 * Safety net for /p/:id. Netlify proxies that path to the backend, which serves
 * the real share page with per-product OG tags. If that proxy is ever down or
 * not yet configured, the SPA gets the request instead — send the visitor to
 * the product in the shop rather than bouncing them to the gateway.
 */
function ProductLinkFallback() {
  const { id } = useParams();
  return <Navigate to={`/shop?p=${encodeURIComponent(id ?? "")}`} replace />;
}

const router = createBrowserRouter([
  { path: "/", element: <Gateway /> },
  { path: "/shop", element: <App /> },
  { path: "/events", element: <Events /> },
  { path: "/p/:id", element: <ProductLinkFallback /> },
  { path: "/booking", element: <Navigate to="/kyd/info" replace /> },
  { path: "/kyd", element: <KydMusic /> },
  { path: "/kyd/music", element: <Navigate to="/kyd" replace /> },
  { path: "/kyd/live", element: <KydLive /> },
  { path: "/kyd/visuals", element: <KydVisuals /> },
  { path: "/kyd/info", element: <KydInfo /> },
  { path: "/kyd/:slug", element: <KydProject /> },
  { path: "/admin", element: <AdminApp /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

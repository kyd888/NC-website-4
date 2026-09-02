import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import App from "./App";
import AdminApp from "./admin/AdminApp";
import Gateway from "./pages/Gateway";
import Events from "./pages/Events";
import KydMusic from "./pages/kyd/KydMusic";
import KydProject from "./pages/kyd/KydProject";
import KydLive from "./pages/kyd/KydLive";
import KydVisuals from "./pages/kyd/KydVisuals";
import KydInfo from "./pages/kyd/KydInfo";
import "./index.css";

const router = createBrowserRouter([
  { path: "/", element: <Gateway /> },
  { path: "/shop", element: <App /> },
  { path: "/events", element: <Events /> },
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

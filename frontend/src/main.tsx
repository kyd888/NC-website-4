
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import AdminApp from "./admin/AdminApp";
import ArtistLanding from "./pages/ArtistLanding";
import "./index.css";
const router = createBrowserRouter([{ path:"/", element:<App/> }, { path:"/admin", element:<AdminApp/> }, { path:"/kyd", element:<ArtistLanding/> }]);
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>);

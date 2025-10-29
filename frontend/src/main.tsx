
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import AdminApp from "./admin/AdminApp";
import "./index.css";
const router = createBrowserRouter([{ path:"/", element:<App/> }, { path:"/admin", element:<AdminApp/> }]);
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>);

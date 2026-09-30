import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { AdminProvider } from "@/contexts/AdminContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { isLocalAuth } from "@/lib/authMode";
import { MsalBoundary } from "@/app/MsalBoundary";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import { router } from "@/app/router";
import "./index.css";
import "./styles/public.css";
import "@/i18n";

if (import.meta.env.DEV) {
  console.info(`[auth] mode: ${isLocalAuth() ? "local (dev sign-in, no Entra)" : "msal"}`);
}

// T033: routing moved from App.tsx (Routes/Route) to a data router
// (createBrowserRouter, src/app/router.tsx) with layouts and a route
// metadata registry. PWAUpdatePrompt and Toaster don't need router
// context, so they stay outside RouterProvider, same as before.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <MsalBoundary>
          <AuthProvider>
            <AdminProvider>
              <RouterProvider router={router} />
              <PWAUpdatePrompt />
              <Toaster position="top-right" />
            </AdminProvider>
          </AuthProvider>
        </MsalBoundary>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
);

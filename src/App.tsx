import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import Portfolio from "./pages/Portfolio";
import Newsletters from "./pages/Newsletters";
import Philosophy from "./pages/Philosophy";
import Analysis from "./pages/Analysis";
import Watchlist from "./pages/Watchlist";
import NorthStar from "./pages/NorthStar";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Index />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/portfolio"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Portfolio />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/newsletters"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Newsletters />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/watchlist"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Watchlist />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/philosophy"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Philosophy />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/analysis"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Analysis />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/north-star"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <NorthStar />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Settings />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

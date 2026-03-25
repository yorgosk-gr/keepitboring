import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy load all pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Newsletters = lazy(() => import("./pages/Newsletters"));
const Philosophy = lazy(() => import("./pages/Philosophy"));
const Analysis = lazy(() => import("./pages/Analysis"));
const Watchlist = lazy(() => import("./pages/Watchlist"));
const NorthStar = lazy(() => import("./pages/NorthStar"));
const Settings = lazy(() => import("./pages/Settings"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const PageLoader = () => (
  <div className="space-y-4 p-6">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const ProtectedPage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <AppLayout>
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          {children}
        </Suspense>
      </ErrorBoundary>
    </AppLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedPage><Index /></ProtectedPage>} />
            <Route path="/portfolio" element={<ProtectedPage><Portfolio /></ProtectedPage>} />
            <Route path="/newsletters" element={<ProtectedPage><Newsletters /></ProtectedPage>} />
            <Route path="/watchlist" element={<ProtectedPage><Watchlist /></ProtectedPage>} />
            <Route path="/philosophy" element={<ProtectedPage><Philosophy /></ProtectedPage>} />
            <Route path="/analysis" element={<ProtectedPage><Analysis /></ProtectedPage>} />
            <Route path="/north-star" element={<ProtectedPage><NorthStar /></ProtectedPage>} />
            <Route path="/settings" element={<ProtectedPage><Settings /></ProtectedPage>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

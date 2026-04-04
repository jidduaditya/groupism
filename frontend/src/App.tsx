import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MapBackground from "@/components/MapBackground";
import Index from "./pages/Index.tsx";
import TripRoom from "./pages/TripRoom.tsx";
import JoinTrip from "./pages/JoinTrip.tsx";
import NotFound from "./pages/NotFound.tsx";

const AdminDashboard = lazy(() => import("./pages/AdminDashboard.tsx"));

const queryClient = new QueryClient();

function AppRoutes() {
  const location = useLocation();
  const isAdmin = location.pathname === "/admin";

  return (
    <>
      {!isAdmin && <MapBackground />}
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/trip/:id" element={<TripRoom />} />
        <Route path="/join/:code" element={<JoinTrip />} />
        <Route path="/t/:code" element={<JoinTrip />} />
        <Route
          path="/admin"
          element={
            <Suspense fallback={null}>
              <AdminDashboard />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

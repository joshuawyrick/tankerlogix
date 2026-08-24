import { Switch, Route, Router as WouterRouter } from "wouter";
import { useBrowserLocation } from "wouter/use-browser-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useTransition } from "react";
import { Loader2 } from "lucide-react";

// Wrap wouter navigation in a React transition so lazy-loaded route chunks
// load without the "component suspended while responding to synchronous input"
// warning — the current page stays visible until the next chunk is ready.
const useTransitionLocation: typeof useBrowserLocation = (options) => {
  const [location, navigate] = useBrowserLocation(options);
  const [, startTransition] = useTransition();
  const transitionNavigate: typeof navigate = (to, navOptions) => {
    startTransition(() => navigate(to, navOptions));
  };
  return [location, transitionNavigate];
};
import Navigation from "@/components/layout/navigation";
import NotFound from "@/pages/not-found";

const Upload = lazy(() => import("@/pages/upload"));
const Locations = lazy(() => import("@/pages/locations"));
const ContractedRoutes = lazy(() => import("@/pages/contracted-routes"));
const Customers = lazy(() => import("@/pages/customers"));
const ShiftBuilder = lazy(() => import("@/pages/shift-builder"));
const ShiftHistory = lazy(() => import("@/pages/shift-history"));
const ShiftPlanner = lazy(() => import("@/pages/shift-planner"));
const Calculator = lazy(() => import("@/pages/calculator"));
const Settings = lazy(() => import("@/pages/settings"));

function Router() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <Switch>
      <Route path="/upload" component={Upload} />
      <Route path="/locations" component={Locations} />
      <Route path="/customers" component={Customers} />
      <Route path="/contracted-routes" component={ContractedRoutes} />
      <Route path="/shift-builder" component={ShiftBuilder} />
      <Route path="/shift-history" component={ShiftHistory} />
      <Route path="/shift-planner" component={ShiftPlanner} />
      <Route path="/calculator" component={Calculator} />
      <Route path="/settings" component={Settings} />
      <Route path="/" component={Calculator} />
      <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter hook={useTransitionLocation}>
          <div className="min-h-screen bg-background">
            <Navigation />
            <div className="pt-[90px] md:pt-[105px]">
              <Router />
            </div>
            <Toaster />
          </div>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

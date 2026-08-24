import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { 
  Upload, 
  MapPin, 
  Calculator, 
  Settings,
  FileText,
  Menu,
  X,
  Route,
  Calendar,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import logoUrl from "@assets/Tanker Logix logo 2_1758403216240.png";

export default function Navigation() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Split navigation items into left and right arrays
  const leftNavItems = [
    { path: "/contracted-routes", label: "Contracted Routes", icon: Route },
    { path: "/shift-builder", label: "Shift Builder", icon: Calendar },
  ];

  const rightNavItems = [
    { path: "/locations", label: "Locations", icon: MapPin },
    { path: "/customers", label: "Customers", icon: Users },
    { path: "/settings", label: "Settings", icon: Settings },
  ];

  // Combine for mobile menu
  const allNavItems = [...leftNavItems, ...rightNavItems];

  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    return location.startsWith(path) && path !== "/";
  };

  const handleMobileNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm shadow-lg border-b border-border">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-[15px]">
          {/* Mobile Layout - Logo centered with hamburger below */}
          <div className="md:hidden flex flex-col items-center">
            <Link href="/" className="flex items-center mb-2">
              <img 
                src={logoUrl} 
                alt="Tanker Logix logo" 
                className="h-[60px] w-auto max-w-[450px] object-contain"
                data-testid="nav-logo"
              />
            </Link>
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative"
                  data-testid="mobile-menu-trigger"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 bg-card shadow-lg border-l border-border">
                <div className="flex flex-col space-y-4 mt-8">
                  <div className="flex items-center justify-center pb-4 border-b border-border">
                    <img 
                      src={logoUrl} 
                      alt="Tanker Logix logo" 
                      className="h-[40px] w-auto max-w-[200px] object-contain"
                      data-testid="mobile-nav-logo"
                    />
                  </div>
                  <nav className="flex flex-col space-y-2">
                    {allNavItems.map(({ path, label, icon: Icon }) => (
                      <Link key={path} href={path}>
                        <button
                          className={cn(
                            "flex items-center w-full px-3 py-3 text-left font-medium transition-all duration-200 rounded-md",
                            isActive(path)
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-foreground/70 hover:text-foreground hover:bg-accent"
                          )}
                          onClick={handleMobileNavClick}
                          data-testid={`mobile-nav-${label.toLowerCase()}`}
                        >
                          <Icon className="w-5 h-5 mr-3" />
                          {label}
                        </button>
                      </Link>
                    ))}
                  </nav>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Desktop Layout - Three column grid */}
          <div className="hidden md:grid grid-cols-[1fr_auto_1fr] items-center">
            {/* Left navigation items */}
            <div className="flex items-center gap-6 justify-self-start">
              {leftNavItems.map(({ path, label, icon: Icon }) => (
                <Link key={path} href={path}>
                  <button
                    className={cn(
                      "flex items-center px-3 py-2 text-base font-medium transition-all duration-200 rounded-md relative",
                      isActive(path)
                        ? "text-primary bg-primary/10 shadow-sm"
                        : "text-foreground/70 hover:text-foreground hover:bg-accent/50"
                    )}
                    data-testid={`nav-${label.toLowerCase()}`}
                  >
                    <Icon className="w-5 h-5 mr-1" />
                    {label}
                  </button>
                </Link>
              ))}
            </div>
            
            {/* Centered logo */}
            <div className="justify-self-center">
              <Link href="/" className="flex items-center">
                <img 
                  src={logoUrl} 
                  alt="Tanker Logix logo" 
                  className="h-[75px] w-auto max-w-[599px] object-contain"
                  data-testid="nav-logo"
                />
              </Link>
            </div>
            
            {/* Right navigation items */}
            <div className="flex items-center gap-6 justify-self-end">
              {rightNavItems.map(({ path, label, icon: Icon }) => (
                <Link key={path} href={path}>
                  <button
                    className={cn(
                      "flex items-center px-3 py-2 text-base font-medium transition-all duration-200 rounded-md relative",
                      isActive(path)
                        ? "text-primary bg-primary/10 shadow-sm"
                        : "text-foreground/70 hover:text-foreground hover:bg-accent/50"
                    )}
                    data-testid={`nav-${label.toLowerCase()}`}
                  >
                    <Icon className="w-5 h-5 mr-1" />
                    {label}
                  </button>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
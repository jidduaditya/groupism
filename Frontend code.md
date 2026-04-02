# Groupism — Complete Source Code

All project source files for the Groupism group travel planning app.

---

## `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Groupism — Group Trip Planning</title>
    <meta name="description" content="Stop herding cats. Start planning trips." />
    <meta name="author" content="Groupism" />

    <meta property="og:title" content="Groupism" />
    <meta property="og:description" content="Group trip coordination for the reluctant organiser." />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://lovable.dev/opengraph-image-p98pqg.png" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@Lovable" />
    <meta name="twitter:image" content="https://lovable.dev/opengraph-image-p98pqg.png" />

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,700;0,9..144,900;1,9..144,300;1,9..144,700;1,9..144,900&family=Geist:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  </head>

  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

```

---

## `src/main.tsx`

```tsx
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

```

---

## `src/App.tsx`

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MapBackground from "@/components/MapBackground";
import Index from "./pages/Index.tsx";
import CreateTrip from "./pages/CreateTrip.tsx";
import TripRoom from "./pages/TripRoom.tsx";
import JoinTrip from "./pages/JoinTrip.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <MapBackground />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/create" element={<CreateTrip />} />
          <Route path="/trip/:id" element={<TripRoom />} />
          <Route path="/join/:code" element={<JoinTrip />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

```

---

## `src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 45 30% 96%;
    --foreground: 30 10% 15%;

    --card: 45 25% 93%;
    --card-foreground: 30 10% 15%;

    --popover: 45 25% 91%;
    --popover-foreground: 30 10% 15%;

    --primary: 36 90% 42%;
    --primary-foreground: 45 30% 96%;

    --secondary: 45 15% 90%;
    --secondary-foreground: 30 10% 25%;

    --muted: 45 15% 90%;
    --muted-foreground: 30 8% 45%;

    --accent: 36 90% 42%;
    --accent-foreground: 45 30% 96%;

    --destructive: 12 55% 48%;
    --destructive-foreground: 45 30% 96%;

    --confirmed: 152 36% 36%;
    --confirmed-light: 146 36% 49%;

    --border: 30 10% 15% / 0.10;
    --border-subtle: 30 10% 15% / 0.06;
    --border-strong: 30 10% 15% / 0.20;
    --input: 30 10% 15% / 0.10;
    --ring: 36 90% 42%;

    --radius: 4px;

    --bg-base: #F5F0E8;
    --bg-surface: #EDE8DF;
    --bg-elevated: #E5E0D6;
    --bg-hover: #DDD8CE;

    --accent-amber: #B87A08;
    --accent-amber-light: #D4900A;
    --accent-terra: #B5503A;
    --accent-green: #2E6B4A;
    --accent-green-light: #3A7D5C;

    --text-primary: #1C1A15;
    --text-secondary: #6B6560;
    --text-tertiary: #9A9490;

    --amber-glow: rgba(184, 122, 8, 0.12);

    --sidebar-background: 45 25% 94%;
    --sidebar-foreground: 30 10% 15%;
    --sidebar-primary: 36 90% 42%;
    --sidebar-primary-foreground: 45 30% 96%;
    --sidebar-accent: 45 15% 90%;
    --sidebar-accent-foreground: 30 10% 15%;
    --sidebar-border: 30 10% 15% / 0.10;
    --sidebar-ring: 36 90% 42%;
  }
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    background-color: var(--bg-base);
    color: var(--text-primary);
    font-family: 'Geist', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body::after {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
    opacity: 0.025;
    pointer-events: none;
    z-index: 9999;
  }
}

@layer utilities {
  .font-display {
    font-family: 'Fraunces', serif;
  }

  .font-ui {
    font-family: 'Geist', sans-serif;
  }

  .font-mono-code {
    font-family: 'JetBrains Mono', monospace;
  }

  .eyebrow {
    font-family: 'Geist', sans-serif;
    font-weight: 500;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .section-divider {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 2rem 0 1.5rem;
  }
  .section-divider::before,
  .section-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-subtle);
  }
  .section-divider span {
    font-family: 'Geist', sans-serif;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    white-space: nowrap;
  }
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

@keyframes voteScale {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

.animate-shimmer {
  animation: shimmer 1.5s infinite;
}

.animate-vote-scale {
  animation: voteScale 0.2s ease-out;
}

/* Native date input styling */
input[type="date"] {
  color-scheme: light;
}

```

---

## `tailwind.config.ts`

```ts
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ['Fraunces', 'serif'],
        ui: ['Geist', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        confirmed: {
          DEFAULT: "hsl(var(--confirmed))",
          light: "hsl(var(--confirmed-light))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        surface: "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
        hover: "var(--bg-hover)",
        amber: {
          DEFAULT: "var(--accent-amber)",
          light: "var(--accent-amber-light)",
          glow: "var(--amber-glow)",
        },
        terra: "var(--accent-terra)",
        green: {
          DEFAULT: "var(--accent-green)",
          light: "var(--accent-green-light)",
        },
        "t-primary": "var(--text-primary)",
        "t-secondary": "var(--text-secondary)",
        "t-tertiary": "var(--text-tertiary)",
        "b-subtle": "var(--border-subtle)",
        "b-mid": "rgba(28, 26, 21, 0.10)",
        "b-strong": "rgba(28, 26, 21, 0.20)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

```

---

## `vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));

```

---

## `src/components/MapBackground.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];

const MapBackground = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [center, setCenter] = useState<[number, number] | null>(null);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCenter([pos.coords.latitude, pos.coords.longitude]),
        () => setCenter(DEFAULT_CENTER)
      );
    } else {
      setCenter(DEFAULT_CENTER);
    }
  }, []);

  useEffect(() => {
    if (!center || !mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center,
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      keyboard: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png").addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [center]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <div ref={mapRef} className="w-full h-full" style={{ background: "var(--bg-base)" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(245,240,232,0.55) 0%, rgba(245,240,232,0.75) 60%, rgba(245,240,232,0.92) 100%)" }} />
    </div>
  );
};

export default MapBackground;

```

---

## `src/components/Header.tsx`

```tsx
import { Link } from "react-router-dom";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-10">
      <Link to="/" className="font-display font-medium text-lg text-t-primary tracking-wide">
        Groupism
      </Link>
    </header>
  );
};

export default Header;

```

---

## `src/components/NavLink.tsx`

```tsx
import { NavLink as RouterNavLink, NavLinkProps } from "react-router-dom";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, ...props }, ref) => {
    return (
      <RouterNavLink
        ref={ref}
        to={to}
        className={({ isActive, isPending }) =>
          cn(className, isActive && activeClassName, isPending && pendingClassName)
        }
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };

```

---

## `src/components/DestinationCard.tsx`

```tsx
import { useState } from "react";
import { cn } from "@/lib/utils";

interface DestinationCardProps {
  name: string;
  tagline: string;
  votes: number;
  pros: string[];
  cons: string[];
  bestFor: string;
  estCost: string;
  hasVoted?: boolean;
  isWinning?: boolean;
  onVote?: () => void;
}

const DestinationCard = ({
  name,
  tagline,
  votes,
  pros,
  cons,
  bestFor,
  estCost,
  hasVoted = false,
  isWinning = false,
  onVote,
}: DestinationCardProps) => {
  const [animating, setAnimating] = useState(false);

  const handleVote = () => {
    if (onVote) {
      setAnimating(true);
      onVote();
      setTimeout(() => setAnimating(false), 200);
    }
  };

  return (
    <div
      className={cn(
        "py-8 border-l-[3px] pl-6 md:pl-8",
        hasVoted
          ? "border-l-amber"
          : isWinning
          ? "border-l-green"
          : "border-l-transparent"
      )}
    >
      {/* Vote count */}
      <div
        className={cn(
          "font-mono text-[48px] md:text-[72px] leading-none mb-2",
          votes > 0 ? "text-amber" : "text-t-tertiary",
          animating && "animate-vote-scale"
        )}
      >
        {String(votes).padStart(2, "0")}
      </div>

      {/* Destination name */}
      <h3 className="font-display text-[32px] md:text-[40px] font-bold leading-[1.05] text-t-primary mb-1">
        {name}
      </h3>
      <p className="font-ui font-light text-t-secondary text-sm mb-6">
        {tagline}
      </p>

      {/* Pros & Cons */}
      <div className="space-y-1.5 mb-5">
        {pros.map((pro, i) => (
          <div key={`pro-${i}`} className="flex items-start gap-2 text-sm font-ui">
            <span className="text-green mt-0.5">✓</span>
            <span className="text-t-primary">{pro}</span>
          </div>
        ))}
        {cons.map((con, i) => (
          <div key={`con-${i}`} className="flex items-start gap-2 text-sm font-ui">
            <span className="text-terra mt-0.5">✗</span>
            <span className="text-t-primary">{con}</span>
          </div>
        ))}
      </div>

      {/* Meta */}
      <div className="space-y-0.5 mb-6">
        <p className="font-ui font-light text-xs text-t-tertiary">
          Best for: {bestFor}
        </p>
        <p className="font-ui font-light text-xs text-t-tertiary">
          Est. cost: {estCost}
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={handleVote}
        className={cn(
          "h-[44px] rounded-[4px] font-ui text-sm font-medium transition-all duration-150 active:scale-[0.97]",
          hasVoted
            ? "border-l-[3px] border-l-amber text-amber bg-transparent px-6"
            : "bg-transparent border border-b-mid text-t-primary hover:bg-hover px-6"
        )}
      >
        {hasVoted ? "✓ Voted" : `Vote for ${name}`}
      </button>
    </div>
  );
};

export default DestinationCard;

```

---

## `src/components/ReadinessBar.tsx`

```tsx
import { cn } from "@/lib/utils";

interface ReadinessBarProps {
  members: Array<{
    name: string;
    status: "confirmed" | "voted" | "none";
  }>;
}

const ReadinessBar = ({ members }: ReadinessBarProps) => {
  const confirmed = members.filter((m) => m.status === "confirmed").length;
  const percentage = Math.round((confirmed / members.length) * 100);

  return (
    <div>
      {/* Names cast list */}
      <div className="flex flex-wrap gap-x-6 gap-y-3 mt-4">
        {members.map((member, i) => (
          <span
            key={i}
            className={cn(
              "font-ui text-sm transition-all",
              member.status === "confirmed"
                ? "text-t-primary border-b border-amber pb-0.5"
                : "text-t-primary opacity-[0.35]"
            )}
          >
            {member.name}
          </span>
        ))}
      </div>
      <p className="font-ui font-light text-sm text-t-secondary mt-4">
        {confirmed} of {members.length} people have confirmed.
      </p>
    </div>
  );
};

export default ReadinessBar;

```

---

## `src/pages/Index.tsx`

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { motion } from "framer-motion";
import { ArrowRight, Plane } from "lucide-react";

const Home = () => {
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState("");

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="min-h-screen flex flex-col justify-center px-6 md:px-16 lg:pl-[12vw] lg:pr-[20vw] pt-24 pb-16">
        <div className="max-w-3xl">
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-2 mb-6"
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber/10 text-amber text-xs font-ui font-medium tracking-wide uppercase">
              <Plane className="w-3 h-3" />
              Group Travel
            </span>
          </motion.div>

          {/* Headline */}
          <h1>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="block font-display font-black italic text-[48px] md:text-[64px] lg:text-[80px] leading-[0.95] text-t-primary"
            >
              every group trip.
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="block font-display font-light text-[48px] md:text-[64px] lg:text-[80px] leading-[0.95] text-t-secondary"
            >
              the same five people.
            </motion.span>
          </h1>

          {/* Accent line */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="origin-left w-[100px] h-[2px] mt-8 bg-t-primary/20"
          />

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="font-ui font-medium text-t-primary text-[16px] mt-6 max-w-md leading-relaxed"
          >
            the organiser who's done it alone for the last time.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="space-y-3 max-w-md mt-10"
          >
            <button
              onClick={() => navigate("/create")}
              className="group w-full h-14 px-8 flex items-center justify-between rounded-lg font-ui font-semibold text-sm bg-amber text-[var(--bg-base)] transition-all duration-300 hover:bg-amber-light hover:shadow-lg hover:shadow-amber/20 hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <span>Create a Room</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="enter invite code"
                  className="w-full h-14 px-4 bg-t-primary text-[var(--bg-base)] border-none rounded-lg font-mono text-sm placeholder:text-[var(--bg-base)]/40 focus:outline-none focus:ring-2 focus:ring-t-primary/40 transition-all duration-200"
                />
              </div>
              <button
                onClick={() => inviteCode && navigate(`/join/${inviteCode}`)}
                className="h-14 px-6 bg-t-primary text-[var(--bg-base)] rounded-lg font-ui font-semibold text-sm hover:bg-t-primary/85 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
              >
                Join
              </button>
            </div>
          </motion.div>

          {/* Bottom decorative dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="flex gap-1.5 mt-12"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-amber" />
            <div className="w-1.5 h-1.5 rounded-full bg-terra" />
            <div className="w-1.5 h-1.5 rounded-full bg-green" />
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Home;

```

---

## `src/pages/CreateTrip.tsx`

```tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import DestinationCard from "@/components/DestinationCard";

const budgetPresets = ["₹5K", "₹10K", "₹15K", "₹25K+"];

const presetToValue: Record<string, string> = {
  "₹5K": "5000",
  "₹10K": "10000",
  "₹15K": "15000",
  "₹25K+": "25000",
};

const loadingMessages = [
  "Reading the vibe...",
  "Checking travel windows...",
  "Writing honest tradeoffs...",
];

const mockDestinations = [
  {
    name: "Goa",
    tagline: "Beach energy, good food, iconic India",
    votes: 0,
    pros: ["Great for groups of mixed ages", "Flights are reasonable in March"],
    cons: ["Can get overcrowded on weekends", "Some areas feel tourist-trapped"],
    bestFor: "mixed friend groups",
    estCost: "₹8,000 – ₹12,000 pp",
  },
  {
    name: "Pondicherry",
    tagline: "French Quarter charm, quiet cafés, slower pace",
    votes: 0,
    pros: ["Beautiful architecture and vibe", "Great food scene"],
    cons: ["Beaches aren't great for swimming", "Limited nightlife"],
    bestFor: "couples and calm groups",
    estCost: "₹6,000 – ₹10,000 pp",
  },
  {
    name: "Kasol",
    tagline: "Mountains, trekking, bonfire nights",
    votes: 0,
    pros: ["Stunning scenery on budget", "Great for adventure groups"],
    cons: ["Long travel from most cities", "Weather can be unpredictable"],
    bestFor: "adventure-seeking friends",
    estCost: "₹5,000 – ₹9,000 pp",
  },
];

const CreateTrip = () => {
  const navigate = useNavigate();
  const [tripName, setTripName] = useState("");
  const [groupSize, setGroupSize] = useState(6);
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [confirmBy, setConfirmBy] = useState("");
  const [notes, setNotes] = useState("");

  const [step1Done, setStep1Done] = useState(false);
  const [step2Done, setStep2Done] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [destinations, setDestinations] = useState<typeof mockDestinations | null>(null);

  const currentStep = step2Done ? 3 : step1Done ? 2 : 1;

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingMsgIdx((prev) => (prev + 1) % loadingMessages.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [loading]);

  const handleGetSuggestions = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setDestinations(mockDestinations);
    }, 4500);
  };

  const handleCreateRoom = () => {
    navigate("/trip/demo-trip-123");
  };

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="max-w-xl mx-auto px-6 pt-24 pb-20">
        {/* Progress indicator */}
        <div className="flex gap-3 mb-12">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-[2px] flex-1 transition-colors duration-300 ${
                s <= currentStep ? "bg-t-primary" : "bg-b-mid"
              }`}
            />
          ))}
        </div>

        {/* Step 1 */}
        <section className="mb-16">
          <h2 className="font-display text-[36px] md:text-[40px] font-bold leading-[1.05] text-t-primary mb-8">
            Name the trip
          </h2>

          <div className="space-y-8">
            <input
              type="text"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              placeholder="Goa March '26"
              className="w-full text-[20px] md:text-[24px] font-ui font-medium bg-transparent border-b border-b-mid pb-3 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
            />

            <div>
              <label className="eyebrow block mb-4">HOW MANY PEOPLE</label>
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setGroupSize(Math.max(2, groupSize - 1))}
                  className="text-t-secondary text-2xl font-ui font-light hover:text-t-primary transition-colors h-11 w-11 flex items-center justify-center"
                >
                  −
                </button>
                <span className="font-mono text-[32px] text-t-primary w-12 text-center">
                  {groupSize}
                </span>
                <button
                  onClick={() => setGroupSize(groupSize + 1)}
                  className="text-t-secondary text-2xl font-ui font-light hover:text-t-primary transition-colors h-11 w-11 flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="eyebrow block mb-4">BUDGET PER PERSON (₹)</label>
              <div className="flex items-center gap-4 mb-4">
                <input
                  type="text"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  placeholder="min"
                  className="flex-1 text-lg font-ui bg-transparent border-b border-b-mid pb-2 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
                />
                <span className="text-t-tertiary">—</span>
                <input
                  type="text"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="max"
                  className="flex-1 text-lg font-ui bg-transparent border-b border-b-mid pb-2 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {budgetPresets.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setBudgetMax(presetToValue[preset] || "")}
                    className="px-3 py-1.5 font-ui font-light text-xs border border-b-mid rounded-[4px] text-t-secondary hover:text-t-primary hover:border-b-strong transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {!step1Done && (
              <Button
                variant="amber"
                className="w-full h-11"
                disabled={!tripName}
                onClick={() => setStep1Done(true)}
              >
                Continue
              </Button>
            )}
          </div>
        </section>

        {/* Step 2 */}
        {step1Done && (
          <section className="mb-16">
            <h2 className="font-display text-[36px] md:text-[40px] font-bold leading-[1.05] text-t-primary mb-8">
              When are you going?
            </h2>

            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="eyebrow block mb-3">FROM</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <label className="eyebrow block mb-3">TO</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="eyebrow block mb-3">CONFIRM BY</label>
                <input
                  type="date"
                  value={confirmBy}
                  onChange={(e) => setConfirmBy(e.target.value)}
                  className="w-full h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors"
                />
                <p className="font-ui font-light text-xs text-t-tertiary mt-2">
                  Members who don't respond by this date get nudged.
                </p>
              </div>

              {!step2Done && (
                <Button
                  variant="amber"
                  className="w-full h-11"
                  disabled={!dateFrom || !dateTo}
                  onClick={() => setStep2Done(true)}
                >
                  Continue
                </Button>
              )}
            </div>
          </section>
        )}

        {/* Step 3 */}
        {step2Done && (
          <section className="mb-16">
            <h2 className="font-display text-[36px] md:text-[40px] font-bold leading-[1.05] text-t-primary mb-8">
              Let AI suggest destinations
            </h2>

            <div className="space-y-6">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="anything to know about the group? (elders, kids, people who hate beaches...)"
                className="w-full h-24 p-4 bg-transparent border border-b-mid rounded-[4px] text-t-primary font-ui text-sm placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors resize-none"
              />

              {!destinations && !loading && (
                <Button
                  variant="amber"
                  className="w-full h-[52px] text-sm"
                  onClick={handleGetSuggestions}
                >
                  Get Suggestions from AI
                </Button>
              )}

              {loading && (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-48 bg-surface border-l-[3px] border-l-transparent overflow-hidden relative"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(240,234,214,0.04)] to-transparent animate-shimmer" />
                    </div>
                  ))}
                  <p className="font-ui font-light text-sm text-t-secondary">
                    {loadingMessages[loadingMsgIdx]}
                  </p>
                </div>
              )}

              {destinations && (
                <div className="divide-y divide-b-subtle">
                  {destinations.map((d, i) => (
                    <DestinationCard key={i} {...d} />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Final CTA */}
        {step1Done && (
          <Button
            variant="amber"
            className="w-full h-12 text-sm"
            onClick={handleCreateRoom}
          >
            Create Trip Room →
          </Button>
        )}
      </div>
    </div>
  );
};

export default CreateTrip;

```

---

## `src/pages/TripRoom.tsx`

```tsx
import { useState } from "react";
import Header from "@/components/Header";
import DestinationCard from "@/components/DestinationCard";
import ReadinessBar from "@/components/ReadinessBar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const mockMembers = [
  { name: "Arjun", initials: "AR", status: "confirmed" as const },
  { name: "Priya", initials: "PR", status: "confirmed" as const },
  { name: "Rahul", initials: "RA", status: "voted" as const },
  { name: "Neha", initials: "NE", status: "confirmed" as const },
  { name: "Vikram", initials: "VI", status: "none" as const },
  { name: "Aisha", initials: "AI", status: "confirmed" as const },
  { name: "Karan", initials: "KA", status: "none" as const },
  { name: "Meera", initials: "ME", status: "confirmed" as const },
];

const mockDestinations = [
  {
    name: "Goa",
    tagline: "Beach energy, good food, iconic India",
    votes: 7,
    pros: ["Great for groups of mixed ages", "Flights are reasonable in March"],
    cons: ["Can get overcrowded on weekends", "Some areas feel tourist-trapped"],
    bestFor: "mixed friend groups",
    estCost: "₹8,000 – ₹12,000 pp",
  },
  {
    name: "Pondicherry",
    tagline: "French Quarter charm, quiet cafés, slower pace",
    votes: 4,
    pros: ["Beautiful architecture and vibe", "Great food scene"],
    cons: ["Beaches aren't great for swimming", "Limited nightlife"],
    bestFor: "couples and calm groups",
    estCost: "₹6,000 – ₹10,000 pp",
  },
  {
    name: "Kasol",
    tagline: "Mountains, trekking, bonfire nights",
    votes: 2,
    pros: ["Stunning scenery on budget", "Great for adventure groups"],
    cons: ["Long travel from most cities", "Weather can be unpredictable"],
    bestFor: "adventure-seeking friends",
    estCost: "₹5,000 – ₹9,000 pp",
  },
];

const TripRoom = () => {
  const [destinations, setDestinations] = useState(mockDestinations);
  const [votedIdx, setVotedIdx] = useState<number | null>(null);
  const [budgetConfirmed, setBudgetConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOrganiser = true;
  const unresponded = mockMembers.filter((m) => m.status === "none").length;
  const confirmed = mockMembers.filter((m) => m.status === "confirmed").length;
  const percentage = Math.round((confirmed / mockMembers.length) * 100);

  const handleVote = (idx: number) => {
    setDestinations((prev) =>
      prev.map((d, i) => ({
        ...d,
        votes: i === idx ? (votedIdx === idx ? d.votes - 1 : d.votes + 1) : votedIdx === i ? d.votes - 1 : d.votes,
      }))
    );
    setVotedIdx(votedIdx === idx ? null : idx);
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText("TRIP-X7K9");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const maxVotes = Math.max(...destinations.map((d) => d.votes));

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="max-w-2xl mx-auto px-6 pt-24 pb-20">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-2">
          <div>
            <h1 className="font-display text-[32px] md:text-[36px] font-bold leading-[1.05] text-t-primary">
              Goa March 2026
            </h1>
            <p className="font-mono text-[13px] text-t-secondary mt-1.5">
              ₹8,000 – ₹15,000  ·  15–18 Mar  ·  {mockMembers.length} people
            </p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0">
            <Button variant="outline-strong" size="sm" onClick={handleCopyInvite}>
              {copied ? "Copied!" : "Copy Link"}
            </Button>
          </div>
        </div>

        {/* Readiness */}
        <div className="section-divider mt-12">
          <span>Trip Readiness — <span className="font-mono text-amber">{percentage}%</span></span>
        </div>
        <ReadinessBar members={mockMembers} />
        {isOrganiser && unresponded > 0 && (
          <p className="mt-3 font-ui text-sm text-terra">
            {unresponded} people haven't voted yet.{" "}
            <button className="underline hover:no-underline transition-all">
              Nudge them →
            </button>
          </p>
        )}

        {/* Destinations */}
        <div className="section-divider mt-12">
          <span>Where are we going</span>
        </div>
        <div className="divide-y divide-b-subtle">
          {destinations.map((d, i) => (
            <DestinationCard
              key={i}
              {...d}
              hasVoted={votedIdx === i}
              isWinning={d.votes === maxVotes && d.votes > 0}
              onVote={() => handleVote(i)}
            />
          ))}
        </div>
        <button className="mt-4 font-ui text-sm text-t-secondary hover:text-t-primary transition-colors">
          + Add your own destination
        </button>

        {/* Members */}
        <div className="section-divider mt-12">
          <span>Who's in</span>
        </div>
        <div className="flex flex-wrap gap-4">
          {mockMembers.map((member, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-ui text-xs font-medium bg-elevated text-t-primary transition-all",
                  member.status === "confirmed" && "ring-2 ring-green",
                  member.status === "voted" && "ring-2 ring-amber/50",
                  member.status === "none" && "opacity-40"
                )}
              >
                {member.initials}
              </div>
              <span className="font-ui text-xs text-t-secondary">{member.name}</span>
            </div>
          ))}
        </div>

        {/* Budget */}
        <div className="section-divider mt-12">
          <span>Budget</span>
        </div>
        <p className="font-display text-[28px] font-bold text-t-primary mb-4">
          ₹8,000 – ₹15,000
        </p>
        {budgetConfirmed ? (
          <p className="font-ui text-sm text-green flex items-center gap-2">
            <span>✓</span> You've confirmed the budget
          </p>
        ) : (
          <Button variant="outline-strong" onClick={() => setBudgetConfirmed(true)}>
            I'm okay with this budget
          </Button>
        )}
      </div>
    </div>
  );
};

export default TripRoom;

```

---

## `src/pages/JoinTrip.tsx`

```tsx
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";

const JoinTrip = () => {
  const { code } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      {/* Desktop: split layout. Mobile: stacked full-screen */}
      <div className="min-h-screen flex flex-col lg:flex-row">
        {/* Left — trip context */}
        <div className="flex-1 flex flex-col justify-center px-6 md:px-16 lg:pl-[12vw] lg:pr-12 pt-24 lg:pt-0 pb-8 lg:pb-0">
          <p className="eyebrow mb-4">YOU'VE BEEN INVITED TO</p>
          <h1 className="font-display text-[40px] md:text-[56px] lg:text-[72px] font-black leading-[0.95] text-t-primary mb-4">
            Goa March '26
          </h1>
          <p className="font-mono text-[13px] text-t-secondary">
            ₹8,000 – ₹15,000  ·  15–18 Mar
          </p>
          <p className="font-ui font-light text-sm text-t-secondary mt-2">
            6 people are planning this trip
          </p>
        </div>

        {/* Divider — vertical on desktop, horizontal on mobile */}
        <div className="hidden lg:block w-px bg-b-subtle self-stretch my-20" />
        <div className="lg:hidden h-px bg-b-subtle mx-6" />

        {/* Right — join action */}
        <div className="flex-1 flex flex-col justify-center px-6 md:px-16 lg:pr-[12vw] lg:pl-12 pt-8 lg:pt-0 pb-24 lg:pb-0 max-w-lg lg:max-w-none">
          <p className="font-mono text-xs text-t-tertiary mb-6">
            Code: {code}
          </p>
          <Button
            variant="amber"
            className="w-full h-[52px] text-sm font-ui font-medium"
            onClick={() => navigate("/trip/demo-trip-123")}
          >
            Join
          </Button>
        </div>
      </div>
    </div>
  );
};

export default JoinTrip;

```

---

## `src/pages/NotFound.tsx`

```tsx
import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;

```

---

## `src/lib/utils.ts`

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

```

---

## `components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}

```

---

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "allowJs": true,
    "noImplicitAny": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "paths": {
      "@/*": [
        "./src/*"
      ]
    },
    "skipLibCheck": true,
    "strictNullChecks": false
  },
  "files": [],
  "references": [
    {
      "path": "./tsconfig.app.json"
    },
    {
      "path": "./tsconfig.node.json"
    }
  ]
}
```

---

## `tsconfig.app.json`

```json
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "lib": [
      "ES2020",
      "DOM",
      "DOM.Iterable"
    ],
    "module": "ESNext",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "noEmit": true,
    "noFallthroughCasesInSwitch": false,
    "noImplicitAny": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "paths": {
      "@/*": [
        "./src/*"
      ]
    },
    "skipLibCheck": true,
    "strict": false,
    "target": "ES2020",
    "types": [
      "vitest/globals"
    ],
    "useDefineForClassFields": true
  },
  "include": [
    "src"
  ]
}
```

---

## `postcss.config.js`

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

```

---

## `package.json`

```json
{
  "name": "vite_react_shadcn_ts",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:dev": "vite build --mode development",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.10.0",
    "@radix-ui/react-accordion": "^1.2.11",
    "@radix-ui/react-alert-dialog": "^1.1.14",
    "@radix-ui/react-aspect-ratio": "^1.1.7",
    "@radix-ui/react-avatar": "^1.1.10",
    "@radix-ui/react-checkbox": "^1.3.2",
    "@radix-ui/react-collapsible": "^1.1.11",
    "@radix-ui/react-context-menu": "^2.2.15",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-hover-card": "^1.1.14",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-menubar": "^1.1.15",
    "@radix-ui/react-navigation-menu": "^1.2.13",
    "@radix-ui/react-popover": "^1.1.14",
    "@radix-ui/react-progress": "^1.1.7",
    "@radix-ui/react-radio-group": "^1.3.7",
    "@radix-ui/react-scroll-area": "^1.2.9",
    "@radix-ui/react-select": "^2.2.5",
    "@radix-ui/react-separator": "^1.1.7",
    "@radix-ui/react-slider": "^1.3.5",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-switch": "^1.2.5",
    "@radix-ui/react-tabs": "^1.1.12",
    "@radix-ui/react-toast": "^1.2.14",
    "@radix-ui/react-toggle": "^1.1.9",
    "@radix-ui/react-toggle-group": "^1.1.10",
    "@radix-ui/react-tooltip": "^1.2.7",
    "@tanstack/react-query": "^5.83.0",
    "@types/leaflet": "^1.9.21",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "date-fns": "^3.6.0",
    "embla-carousel-react": "^8.6.0",
    "framer-motion": "^12.38.0",
    "input-otp": "^1.4.2",
    "leaflet": "^1.9.4",
    "lucide-react": "^0.462.0",
    "next-themes": "^0.3.0",
    "react": "^18.3.1",
    "react-day-picker": "^8.10.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.61.1",
    "react-resizable-panels": "^2.1.9",
    "react-router-dom": "^6.30.1",
    "recharts": "^2.15.4",
    "sonner": "^1.7.4",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "vaul": "^0.9.9",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@eslint/js": "^9.32.0",
    "@playwright/test": "^1.57.0",
    "@tailwindcss/typography": "^0.5.16",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.0",
    "@types/node": "^22.16.5",
    "@types/react": "^18.3.23",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react-swc": "^3.11.0",
    "autoprefixer": "^10.4.21",
    "eslint": "^9.32.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-react-refresh": "^0.4.20",
    "globals": "^15.15.0",
    "jsdom": "^20.0.3",
    "lovable-tagger": "^1.1.13",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.38.0",
    "vite": "^5.4.19",
    "vitest": "^3.2.4"
  }
}

```

---


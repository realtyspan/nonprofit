import React, { useEffect, useState, useCallback } from "react";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { api } from "./lib/api";
import { colors } from "./lib/tokens";
import { MODULES } from "./lib/modules";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import Landing from "./views/Landing";
import Login from "./views/Login";
import Dashboard from "./views/Dashboard";
import Worksheet from "./views/Worksheet";
import Deals from "./views/Deals";
import Ledger from "./views/Ledger";
import Reports from "./views/Reports";
import Team from "./views/Team";
import Profile from "./views/Profile";
import RentalBookings from "./views/RentalBookings";
import RentalSpaces from "./views/RentalSpaces";
import RentalBlocks from "./views/RentalBlocks";
import PublicRental from "./views/PublicRental";
import CalendarView from "./views/CalendarView";
import PublicCalendar from "./views/PublicCalendar";

function PublicGate() {
  const [authView, setAuthView] = useState("landing"); // landing | login | signup

  if (authView === "landing") {
    return <Landing onGetStarted={() => setAuthView("signup")} onLogin={() => setAuthView("login")} />;
  }
  return <Login initialMode={authView} onBack={() => setAuthView("landing")} />;
}

function Shell() {
  const { session } = useAuth();
  const [activeModuleKey, setActiveModuleKey] = useState(MODULES[0].key);
  const [view, setView] = useState(MODULES[0].navItems[0].key);
  const [deals, setDeals] = useState([]);
  const [rentalSpaces, setRentalSpaces] = useState([]);
  const [rentalInquiryCount, setRentalInquiryCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshDeals = useCallback(() => {
    api.listDeals().then(setDeals).catch(() => {});
  }, []);

  const refreshRentals = useCallback(() => {
    api.listRentalSpaces().then(setRentalSpaces).catch(() => {});
    api.listRentalBookings("inquiry").then((rows) => setRentalInquiryCount(rows.length)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!session) return;
    refreshDeals();
    refreshRentals();
    setLoading(false);
  }, [session, refreshDeals, refreshRentals]);

  if (!session) return <PublicGate />;

  const activeModule = MODULES.find((m) => m.key === activeModuleKey);
  const eligibleCount = deals.filter((d) => d.status === "active" && d.eligibleToClose).length;
  const moduleBadges = { "bell-jar": eligibleCount, rentals: rentalInquiryCount };
  const navBadges =
    activeModuleKey === "bell-jar" ? { deals: eligibleCount } : activeModuleKey === "rentals" ? { bookings: rentalInquiryCount } : {};

  function switchModule(key) {
    setActiveModuleKey(key);
    setView(MODULES.find((m) => m.key === key).navItems[0].key);
  }

  const navItem = activeModule.navItems.find((n) => n.key === view);
  const title = view === "profile" ? "My Profile" : navItem?.title;
  const subtitle = view === "profile" ? "Update your details or change your password" : navItem?.subtitle;

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.textPrimary }}>
      <TopBar
        modules={MODULES}
        activeModuleKey={activeModuleKey}
        onSwitchModule={switchModule}
        moduleBadges={moduleBadges}
        onOpenProfile={() => setView("profile")}
      />
      <div style={{ display: "flex" }}>
        <Sidebar module={activeModule} view={view} setView={setView} badges={navBadges} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: colors.textPrimary }}>{title}</div>
            <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}>{subtitle}</div>
          </div>

          <div style={{ flex: 1, padding: "28px 32px 60px", overflow: "auto" }}>
            {!loading && (
              <>
                {activeModuleKey === "bell-jar" && view === "dashboard" && <Dashboard deals={deals} />}
                {activeModuleKey === "bell-jar" && view === "worksheet" && <Worksheet deals={deals} onSaved={refreshDeals} />}
                {activeModuleKey === "bell-jar" && view === "deals" && <Deals deals={deals} onChanged={refreshDeals} />}
                {activeModuleKey === "bell-jar" && view === "ledger" && <Ledger />}
                {activeModuleKey === "bell-jar" && view === "reports" && <Reports />}
                {activeModuleKey === "bell-jar" && view === "team" && <Team />}
                {activeModuleKey === "rentals" && view === "bookings" && <RentalBookings spaces={rentalSpaces} onChanged={refreshRentals} />}
                {activeModuleKey === "rentals" && view === "spaces" && <RentalSpaces spaces={rentalSpaces} onChanged={refreshRentals} />}
                {activeModuleKey === "rentals" && view === "blocks" && <RentalBlocks spaces={rentalSpaces} />}
                {activeModuleKey === "calendar" && view === "month" && <CalendarView />}
                {view === "profile" && <Profile />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function matchPublicPath(pathname) {
  const embedMatch = pathname.match(/^\/(rentals|calendar)\/embed\/([a-z0-9-]+)\/?$/);
  if (embedMatch) return { module: embedMatch[1], slug: embedMatch[2], embed: true };
  const m = pathname.match(/^\/(rentals|calendar)\/([a-z0-9-]+)\/?$/);
  return m ? { module: m[1], slug: m[2] } : null;
}

export default function App() {
  const publicMatch = matchPublicPath(window.location.pathname);
  if (publicMatch?.module === "rentals") return <PublicRental slug={publicMatch.slug} embed={publicMatch.embed} />;
  if (publicMatch?.module === "calendar") return <PublicCalendar slug={publicMatch.slug} embed={publicMatch.embed} />;

  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

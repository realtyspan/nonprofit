import React, { useEffect, useState, useCallback } from "react";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { api } from "./lib/api";
import { colors } from "./lib/tokens";
import { MODULES, filterModulesForUser } from "./lib/modules";
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
  const [permissions, setPermissions] = useState(null);
  const [activeModuleKey, setActiveModuleKey] = useState(null);
  const [view, setView] = useState(null);
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

  const refreshPermissions = useCallback(() => {
    return api.getMyPermissions().then(setPermissions).catch(() => {});
  }, []);

  // Keyed on the logged-in user's id, not just `session` truthiness — Shell
  // itself never unmounts across a login/logout cycle (AuthProvider wraps it
  // once), so without this, switching accounts would keep the previous
  // user's activeModuleKey/view around and land them on a module or screen
  // that belongs to the account they just left instead of their own.
  const userId = session?.user?.id;
  useEffect(() => {
    if (!session) return;
    setActiveModuleKey(null);
    setView(null);
    setLoading(true);
    refreshDeals();
    refreshRentals();
    refreshPermissions().then(() => setLoading(false));
  }, [userId, refreshDeals, refreshRentals, refreshPermissions]);

  // Once permissions load, land on the user's first visible module — a
  // no-grant user (or one still mid-onboarding) has no modules at all and
  // lands on Profile instead.
  useEffect(() => {
    if (!permissions || activeModuleKey !== null) return;
    const visible = filterModulesForUser(MODULES, permissions);
    if (visible.length) {
      setActiveModuleKey(visible[0].key);
      setView(visible[0].navItems[0].key);
    } else {
      setView("profile");
    }
  }, [permissions, activeModuleKey]);

  if (!session) return <PublicGate />;
  if (loading || view === null) return null;

  const visibleModules = filterModulesForUser(MODULES, permissions);
  const activeModule = visibleModules.find((m) => m.key === activeModuleKey);
  const eligibleCount = deals.filter((d) => d.status === "active" && d.eligibleToClose).length;
  const moduleBadges = { "bell-jar": eligibleCount, rentals: rentalInquiryCount };
  const navBadges =
    activeModuleKey === "bell-jar" ? { deals: eligibleCount } : activeModuleKey === "rentals" ? { bookings: rentalInquiryCount } : {};

  function switchModule(key) {
    setActiveModuleKey(key);
    setView(visibleModules.find((m) => m.key === key).navItems[0].key);
  }

  const navItem = activeModule?.navItems.find((n) => n.key === view);
  const title = view === "profile" ? "My Profile" : view === "team" ? "Team" : navItem?.title;
  const subtitle =
    view === "profile" ? "Update your details or change your password"
    : view === "team" ? "Everyone with access to this organization"
    : navItem?.subtitle;

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.textPrimary }}>
      <TopBar
        modules={visibleModules}
        activeModuleKey={activeModuleKey}
        onSwitchModule={switchModule}
        moduleBadges={moduleBadges}
        onOpenProfile={() => setView("profile")}
        onOpenTeam={() => setView("team")}
      />
      <div style={{ display: "flex" }}>
        {activeModule && <Sidebar module={activeModule} view={view} setView={setView} badges={navBadges} permissions={permissions} />}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: colors.textPrimary }}>{title}</div>
            <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}>{subtitle}</div>
          </div>

          <div style={{ flex: 1, padding: "28px 32px 60px", overflow: "auto" }}>
            {activeModuleKey === "bell-jar" && view === "dashboard" && <Dashboard deals={deals} />}
            {activeModuleKey === "bell-jar" && view === "worksheet" && <Worksheet deals={deals} onSaved={refreshDeals} />}
            {activeModuleKey === "bell-jar" && view === "deals" && <Deals deals={deals} onChanged={refreshDeals} permissions={permissions} />}
            {activeModuleKey === "bell-jar" && view === "ledger" && <Ledger />}
            {activeModuleKey === "bell-jar" && view === "reports" && <Reports permissions={permissions} />}
            {activeModuleKey === "rentals" && view === "bookings" && <RentalBookings spaces={rentalSpaces} onChanged={refreshRentals} />}
            {activeModuleKey === "rentals" && view === "spaces" && <RentalSpaces spaces={rentalSpaces} onChanged={refreshRentals} />}
            {activeModuleKey === "rentals" && view === "blocks" && <RentalBlocks spaces={rentalSpaces} />}
            {activeModuleKey === "calendar" && view === "month" && <CalendarView />}
            {view === "team" && <Team permissions={permissions} onPermissionsChanged={refreshPermissions} />}
            {view === "profile" && <Profile />}
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

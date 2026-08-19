import React, { useEffect, useState, useCallback } from "react";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { api } from "./lib/api";
import { APP_URL } from "./lib/env";
import { colors } from "./lib/tokens";
import { MODULES, filterModulesForUser, filterNavItemsForUser } from "./lib/modules";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import Landing from "./views/Landing";
import Login from "./views/Login";
import ResetPassword from "./views/ResetPassword";
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
import ManageRaffles from "./views/ManageRaffles";
import RaffleGrid from "./views/RaffleGrid";
import RaffleSellers from "./views/RaffleSellers";
import RaffleAssign from "./views/RaffleAssign";
import RaffleDeposit from "./views/RaffleDeposit";
import RaffleLog from "./views/RaffleLog";
import RaffleRenewals from "./views/RaffleRenewals";
import RaffleReport from "./views/RaffleReport";
import RaffleDrawings from "./views/RaffleDrawings";
import RaffleFinancials from "./views/RaffleFinancials";
import RaffleCheckIn from "./views/RaffleCheckIn";

function PublicGate() {
  // Lets a cross-domain redirect from the marketing site (elkslodges.org)
  // land straight on the signup/login form instead of bouncing through this
  // app's own copy of the landing page first.
  const requestedView = new URLSearchParams(window.location.search).get("view");
  const [authView, setAuthView] = useState(
    requestedView === "signup" || requestedView === "login" ? requestedView : "landing"
  ); // landing | login | signup

  if (authView === "landing") {
    return <Landing onGetStarted={() => setAuthView("signup")} onLogin={() => setAuthView("login")} />;
  }
  return <Login initialMode={authView} onBack={() => setAuthView("landing")} />;
}

// Scoped per user id so switching accounts on the same browser doesn't leak
// one account's last-viewed module/view into another's.
function navStorageKey(userId) {
  return `bellJarNav:${userId}`;
}

function Shell() {
  const { session } = useAuth();
  const [permissions, setPermissions] = useState(null);
  const [activeModuleKey, setActiveModuleKey] = useState(null);
  const [view, setView] = useState(null);
  const [deals, setDeals] = useState([]);
  const [rentalSpaces, setRentalSpaces] = useState([]);
  const [rentalInquiryCount, setRentalInquiryCount] = useState(0);
  const [raffleGames, setRaffleGames] = useState([]);
  const [selectedRaffleGameId, setSelectedRaffleGameId] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshDeals = useCallback(() => {
    api.listDeals().then(setDeals).catch(() => {});
  }, []);

  const refreshRentals = useCallback(() => {
    api.listRentalSpaces().then(setRentalSpaces).catch(() => {});
    api.listRentalBookings("inquiry").then((rows) => setRentalInquiryCount(rows.length)).catch(() => {});
  }, []);

  const refreshRaffleGames = useCallback(() => {
    return api.listRaffleGames().then(setRaffleGames).catch(() => {});
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
    refreshRaffleGames();
    refreshPermissions().then(() => setLoading(false));
  }, [userId, refreshDeals, refreshRentals, refreshRaffleGames, refreshPermissions]);

  // Default to the most-recently-created active game whenever the game list
  // changes and nothing (or something that no longer exists) is selected —
  // e.g. right after login, or right after creating a brand new raffle.
  useEffect(() => {
    if (selectedRaffleGameId && raffleGames.some((g) => g.id === selectedRaffleGameId)) return;
    const firstActive = raffleGames.find((g) => g.status === "active");
    setSelectedRaffleGameId(firstActive ? firstActive.id : raffleGames[0]?.id || null);
  }, [raffleGames, selectedRaffleGameId]);

  // Once permissions load, return to wherever the user last was (so a page
  // refresh doesn't always bounce back to Bell Jar) if that module/view is
  // still valid for their current permissions — otherwise land on the first
  // visible module. A no-grant user (or one still mid-onboarding) has no
  // modules at all and lands on Profile instead.
  useEffect(() => {
    if (!permissions || activeModuleKey !== null) return;
    const visible = filterModulesForUser(MODULES, permissions);

    const saved = userId ? JSON.parse(localStorage.getItem(navStorageKey(userId)) || "null") : null;
    if (saved) {
      const savedModule = visible.find((m) => m.key === saved.activeModuleKey);
      if (savedModule) {
        const savedNavItems = filterNavItemsForUser(savedModule.navItems, permissions, savedModule.key);
        if (saved.view === "profile" || saved.view === "team" || savedNavItems.some((n) => n.key === saved.view)) {
          setActiveModuleKey(savedModule.key);
          setView(saved.view);
          return;
        }
      }
    }

    if (visible.length) {
      const firstModule = visible[0];
      const firstNavItems = filterNavItemsForUser(firstModule.navItems, permissions, firstModule.key);
      setActiveModuleKey(firstModule.key);
      setView(firstNavItems[0].key);
    } else {
      setView("profile");
    }
  }, [permissions, activeModuleKey, userId]);

  // Keep the saved module/view current as the user navigates, so the effect
  // above has something fresh to restore on the next refresh.
  useEffect(() => {
    if (!userId || !activeModuleKey || !view) return;
    localStorage.setItem(navStorageKey(userId), JSON.stringify({ activeModuleKey, view }));
  }, [userId, activeModuleKey, view]);

  if (!session) return <PublicGate />;
  if (loading || view === null) return null;

  const visibleModules = filterModulesForUser(MODULES, permissions);
  const activeModule = visibleModules.find((m) => m.key === activeModuleKey);
  const eligibleCount = deals.filter((d) => d.status === "active" && d.eligibleToClose).length;
  const moduleBadges = { "bell-jar": eligibleCount, rentals: rentalInquiryCount };
  // Same bar as Team.jsx's own canInvite check — no point showing the Team
  // screen's entry point to someone who can't invite or edit anyone there.
  const canSeeTeam = permissions?.orgTier === "Owner" || Object.values(permissions?.moduleGrants || {}).includes("Admin");
  const navBadges =
    activeModuleKey === "bell-jar" ? { deals: eligibleCount } : activeModuleKey === "rentals" ? { bookings: rentalInquiryCount } : {};

  function switchModule(key) {
    const targetModule = visibleModules.find((m) => m.key === key);
    setActiveModuleKey(key);
    setView(filterNavItemsForUser(targetModule.navItems, permissions, key)[0].key);
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
        onOpenTeam={canSeeTeam ? () => setView("team") : null}
      />
      <div style={{ display: "flex" }}>
        {activeModule && <Sidebar module={activeModule} view={view} setView={setView} badges={navBadges} permissions={permissions} />}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: colors.textPrimary }}>{title}</div>
            <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}>{subtitle}</div>
          </div>

          {activeModuleKey === "raffle" && (
            <div style={{ padding: "10px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fafafa", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".03em" }}>Raffle</span>
              {raffleGames.length > 0 ? (
                <select
                  value={selectedRaffleGameId || ""}
                  onChange={(e) => setSelectedRaffleGameId(e.target.value)}
                  style={{ border: `1px solid ${colors.border}`, borderRadius: 7, padding: "6px 10px", fontSize: 13, minWidth: 220 }}
                >
                  {raffleGames.map((g) => (
                    <option key={g.id} value={g.id}>{g.name} ({g.status})</option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: 13, color: colors.textSecondary }}>No raffles yet</span>
              )}
            </div>
          )}

          <div style={{ flex: 1, padding: "28px 32px 60px", overflow: "auto" }}>
            {activeModuleKey === "bell-jar" && view === "dashboard" && <Dashboard deals={deals} />}
            {activeModuleKey === "bell-jar" && view === "worksheet" && <Worksheet deals={deals} onSaved={refreshDeals} />}
            {activeModuleKey === "bell-jar" && view === "deals" && <Deals deals={deals} onChanged={refreshDeals} permissions={permissions} />}
            {activeModuleKey === "bell-jar" && view === "ledger" && <Ledger />}
            {activeModuleKey === "bell-jar" && view === "reports" && <Reports permissions={permissions} />}
            {activeModuleKey === "rentals" && view === "bookings" && <RentalBookings spaces={rentalSpaces} onChanged={refreshRentals} />}
            {activeModuleKey === "rentals" && view === "spaces" && <RentalSpaces spaces={rentalSpaces} onChanged={refreshRentals} />}
            {activeModuleKey === "rentals" && view === "blocks" && <RentalBlocks spaces={rentalSpaces} />}
            {activeModuleKey === "calendar" && view === "month" && <CalendarView rentalSpaces={rentalSpaces} permissions={permissions} />}
            {activeModuleKey === "raffle" && view === "manage" && <ManageRaffles games={raffleGames} gameId={selectedRaffleGameId} onGamesChanged={refreshRaffleGames} />}
            {activeModuleKey === "raffle" && view === "grid" && <RaffleGrid gameId={selectedRaffleGameId} permissions={permissions} currentUserId={session?.user?.id} />}
            {activeModuleKey === "raffle" && view === "sellers" && <RaffleSellers gameId={selectedRaffleGameId} permissions={permissions} />}
            {activeModuleKey === "raffle" && view === "assign" && <RaffleAssign gameId={selectedRaffleGameId} />}
            {activeModuleKey === "raffle" && view === "deposit" && <RaffleDeposit gameId={selectedRaffleGameId} />}
            {activeModuleKey === "raffle" && view === "log" && <RaffleLog gameId={selectedRaffleGameId} />}
            {activeModuleKey === "raffle" && view === "renewals" && <RaffleRenewals gameId={selectedRaffleGameId} />}
            {activeModuleKey === "raffle" && view === "report" && <RaffleReport games={raffleGames} gameId={selectedRaffleGameId} />}
            {activeModuleKey === "raffle" && view === "drawings" && <RaffleDrawings gameId={selectedRaffleGameId} />}
            {activeModuleKey === "raffle" && view === "financials" && <RaffleFinancials />}
            {activeModuleKey === "raffle" && view === "checkin" && <RaffleCheckIn gameId={selectedRaffleGameId} />}
            {view === "team" && canSeeTeam && <Team permissions={permissions} onPermissionsChanged={refreshPermissions} />}
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

// The bare domain is marketing-only — it never needs a session, so it skips
// AuthProvider/Shell entirely. Every other hostname (the app subdomain,
// localhost, Railway's own *.up.railway.app) keeps today's behavior.
const MARKETING_HOSTNAMES = ["elkslodges.org", "www.elkslodges.org"];

export default function App() {
  if (MARKETING_HOSTNAMES.includes(window.location.hostname)) {
    return (
      <Landing
        onGetStarted={() => { window.location.href = `${APP_URL}/?view=signup`; }}
        onLogin={() => { window.location.href = `${APP_URL}/?view=login`; }}
      />
    );
  }

  const publicMatch = matchPublicPath(window.location.pathname);
  if (publicMatch?.module === "rentals") return <PublicRental slug={publicMatch.slug} embed={publicMatch.embed} />;
  if (publicMatch?.module === "calendar") return <PublicCalendar slug={publicMatch.slug} embed={publicMatch.embed} />;

  // Needs to render for a logged-out visitor arriving from an email link, so
  // it's handled before AuthProvider/Shell rather than as a route inside it.
  if (window.location.pathname === "/reset-password") return <ResetPassword />;

  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

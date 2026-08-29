import React, { useEffect, useState, useCallback } from "react";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { api } from "./lib/api";
import { APP_URL, MARKETING_HOSTNAMES } from "./lib/env";
import { colors } from "./lib/tokens";
import { MODULES, filterModulesForUser, filterNavItemsForUser } from "./lib/modules";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import MobileNavDrawer from "./components/MobileNavDrawer";
import { useIsMobile } from "./lib/viewport";
import Hub from "./views/marketing/Hub";
import ModulePage from "./views/marketing/ModulePage";
import { MARKETING_MODULES } from "./lib/marketingContent";
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
import RentalFundsTurnover from "./views/RentalFundsTurnover";
import PublicRental from "./views/PublicRental";
import CalendarView from "./views/CalendarView";
import PublicCalendar from "./views/PublicCalendar";
import PublicGolf from "./views/PublicGolf";
import PublicGolfPay from "./views/PublicGolfPay";
import PublicRaffleUnsubscribe from "./views/PublicRaffleUnsubscribe";
import PlatformAdminApp from "./views/platform-admin/PlatformAdminApp";
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
import ManageGolfTournaments from "./views/ManageGolfTournaments";
import GolfRoster from "./views/GolfRoster";
import GolfSponsors from "./views/GolfSponsors";
import GolfCheckIn from "./views/GolfCheckIn";
import GolfLog from "./views/GolfLog";
import FrsReport from "./views/elks-tools/FrsReport";

function PublicGate() {
  // Lets a cross-domain redirect from the marketing site (charitypulse.org)
  // land straight on the signup/login form instead of bouncing through this
  // app's own copy of the landing page first.
  const requestedView = new URLSearchParams(window.location.search).get("view");
  const [authView, setAuthView] = useState(
    requestedView === "signup" || requestedView === "login" ? requestedView : "landing"
  ); // landing | login | signup

  if (authView === "landing") {
    return <Hub onGetStarted={() => setAuthView("signup")} onLogin={() => setAuthView("login")} />;
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
  // Captured once at mount (not recomputed on every render) so it stays true
  // even after the cleanup effect below strips the query string — Stripe's
  // Account Link return_url lands here after the org admin finishes (or
  // abandons) hosted onboarding.
  const [golfStripeReturn] = useState(() => new URLSearchParams(window.location.search).get("golfStripeReturn") === "1");
  const [permissions, setPermissions] = useState(null);
  const [activeModuleKey, setActiveModuleKey] = useState(null);
  const [view, setView] = useState(null);
  const [deals, setDeals] = useState([]);
  const [rentalSpaces, setRentalSpaces] = useState([]);
  const [rentalInquiryCount, setRentalInquiryCount] = useState(0);
  const [raffleGames, setRaffleGames] = useState([]);
  const [selectedRaffleGameId, setSelectedRaffleGameId] = useState(null);
  const selectedRaffleGame = raffleGames.find((g) => g.id === selectedRaffleGameId) || null;
  const [golfTournaments, setGolfTournaments] = useState([]);
  const [selectedGolfTournamentId, setSelectedGolfTournamentId] = useState(null);
  const selectedGolfTournament = golfTournaments.find((t) => t.id === selectedGolfTournamentId) || null;
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile();

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

  const refreshGolfTournaments = useCallback(() => {
    return api.listGolfTournaments().then(setGolfTournaments).catch(() => {});
  }, []);

  const refreshPermissions = useCallback(() => {
    return api.getMyPermissions().then(setPermissions).catch(() => {});
  }, []);

  // Stripe doesn't push account.updated the instant hosted onboarding
  // finishes, so this gives an immediate, accurate status right when the
  // admin lands back instead of waiting on the webhook — see golfLogic/
  // golf.js's own /stripe-connect/sync route (same call, admin-triggered).
  useEffect(() => {
    if (!golfStripeReturn) return;
    api.syncGolfStripeConnect().catch(() => {}).finally(() => {
      window.history.replaceState({}, "", window.location.pathname);
    });
  }, [golfStripeReturn]);

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
    refreshGolfTournaments();
    refreshPermissions().then(() => setLoading(false));
  }, [userId, refreshDeals, refreshRentals, refreshRaffleGames, refreshGolfTournaments, refreshPermissions]);

  // Default to the most-recently-created active game whenever the game list
  // changes and nothing (or something that no longer exists) is selected —
  // e.g. right after login, or right after creating a brand new raffle.
  useEffect(() => {
    if (selectedRaffleGameId && raffleGames.some((g) => g.id === selectedRaffleGameId)) return;
    const firstActive = raffleGames.find((g) => g.status === "active");
    setSelectedRaffleGameId(firstActive ? firstActive.id : raffleGames[0]?.id || null);
  }, [raffleGames, selectedRaffleGameId]);

  // Same default-selection convention as raffle above: prefer an open
  // tournament over a draft/closed one whenever nothing (or something that
  // no longer exists) is selected.
  useEffect(() => {
    if (selectedGolfTournamentId && golfTournaments.some((t) => t.id === selectedGolfTournamentId)) return;
    const firstOpen = golfTournaments.find((t) => t.status === "open");
    setSelectedGolfTournamentId(firstOpen ? firstOpen.id : golfTournaments[0]?.id || null);
  }, [golfTournaments, selectedGolfTournamentId]);

  // Once permissions load, return to wherever the user last was (so a page
  // refresh doesn't always bounce back to Bell Jar) if that module/view is
  // still valid for their current permissions — otherwise land on the first
  // visible module. A no-grant user (or one still mid-onboarding) has no
  // modules at all and lands on Profile instead.
  useEffect(() => {
    if (!permissions || activeModuleKey !== null) return;
    const visible = filterModulesForUser(MODULES, permissions);

    if (golfStripeReturn && visible.some((m) => m.key === "golf")) {
      setActiveModuleKey("golf");
      setView("manage");
      return;
    }

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
  }, [permissions, activeModuleKey, userId, golfStripeReturn]);

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
        onOpenMenu={() => setDrawerOpen(true)}
        isPlatformAdmin={!!permissions?.platformRole}
      />
      <MobileNavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        modules={visibleModules}
        activeModuleKey={activeModuleKey}
        onSwitchModule={switchModule}
        moduleBadges={moduleBadges}
        activeModule={activeModule}
        view={view}
        setView={setView}
        navBadges={navBadges}
        permissions={permissions}
        canSeeTeam={canSeeTeam}
        onOpenTeam={() => setView("team")}
        onOpenProfile={() => setView("profile")}
      />
      <div style={{ display: "flex" }}>
        {!isMobile && activeModule && <Sidebar module={activeModule} view={view} setView={setView} badges={navBadges} permissions={permissions} />}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: isMobile ? "14px 16px" : "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: colors.textPrimary }}>{title}</div>
            <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}>{subtitle}</div>
          </div>

          {activeModuleKey === "raffle" && (
            <div style={{ padding: isMobile ? "10px 16px" : "10px 32px", borderBottom: `1px solid ${colors.border}`, background: "#f7f4ec", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".03em" }}>Raffle</span>
              {selectedRaffleGame && (
                <span style={{ fontSize: 17, fontWeight: 700, color: colors.textPrimary }}>{selectedRaffleGame.name}</span>
              )}
              {raffleGames.length > 0 ? (
                <select
                  value={selectedRaffleGameId || ""}
                  onChange={(e) => setSelectedRaffleGameId(e.target.value)}
                  style={{ border: `1px solid ${colors.border}`, borderRadius: 7, padding: "6px 10px", fontSize: 13, minWidth: isMobile ? 0 : 220, flex: isMobile ? 1 : undefined }}
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

          {activeModuleKey === "golf" && (
            <div style={{ padding: isMobile ? "10px 16px" : "10px 32px", borderBottom: `1px solid ${colors.border}`, background: "#f7f4ec", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".03em" }}>Golf</span>
              {selectedGolfTournament && (
                <span style={{ fontSize: 17, fontWeight: 700, color: colors.textPrimary }}>{selectedGolfTournament.name}</span>
              )}
              {golfTournaments.length > 0 ? (
                <select
                  value={selectedGolfTournamentId || ""}
                  onChange={(e) => setSelectedGolfTournamentId(e.target.value)}
                  style={{ border: `1px solid ${colors.border}`, borderRadius: 7, padding: "6px 10px", fontSize: 13, minWidth: isMobile ? 0 : 220, flex: isMobile ? 1 : undefined }}
                >
                  {golfTournaments.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.status})</option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: 13, color: colors.textSecondary }}>No tournaments yet</span>
              )}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0, padding: isMobile ? "16px 16px 40px" : "28px 32px 60px", overflowY: "auto", overflowX: "hidden" }}>
            {activeModuleKey === "bell-jar" && view === "dashboard" && <Dashboard deals={deals} onOpenReports={() => setView("reports")} />}
            {activeModuleKey === "bell-jar" && view === "worksheet" && <Worksheet deals={deals} onSaved={refreshDeals} />}
            {activeModuleKey === "bell-jar" && view === "deals" && <Deals deals={deals} onChanged={refreshDeals} permissions={permissions} />}
            {activeModuleKey === "bell-jar" && view === "ledger" && <Ledger />}
            {activeModuleKey === "bell-jar" && view === "reports" && <Reports permissions={permissions} />}
            {activeModuleKey === "rentals" && view === "bookings" && <RentalBookings spaces={rentalSpaces} onChanged={refreshRentals} permissions={permissions} />}
            {activeModuleKey === "rentals" && view === "funds" && <RentalFundsTurnover permissions={permissions} />}
            {activeModuleKey === "rentals" && view === "spaces" && <RentalSpaces spaces={rentalSpaces} onChanged={refreshRentals} />}
            {activeModuleKey === "rentals" && view === "blocks" && <RentalBlocks spaces={rentalSpaces} />}
            {activeModuleKey === "calendar" && view === "month" && <CalendarView rentalSpaces={rentalSpaces} permissions={permissions} currentUserId={session?.user?.id} />}
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
            {activeModuleKey === "golf" && view === "manage" && <ManageGolfTournaments tournaments={golfTournaments} tournamentId={selectedGolfTournamentId} onTournamentsChanged={refreshGolfTournaments} />}
            {activeModuleKey === "golf" && view === "roster" && <GolfRoster tournament={selectedGolfTournament} />}
            {activeModuleKey === "golf" && view === "sponsors" && <GolfSponsors tournament={selectedGolfTournament} />}
            {activeModuleKey === "golf" && view === "checkin" && <GolfCheckIn tournament={selectedGolfTournament} />}
            {activeModuleKey === "golf" && view === "log" && <GolfLog tournament={selectedGolfTournament} />}
            {activeModuleKey === "elks-tools" && view === "frs" && <FrsReport />}
            {view === "team" && canSeeTeam && <Team permissions={permissions} onPermissionsChanged={refreshPermissions} />}
            {view === "profile" && <Profile />}
          </div>
        </div>
      </div>
    </div>
  );
}

function matchPublicPath(pathname) {
  const embedMatch = pathname.match(/^\/(rentals|calendar|golf)\/embed\/([a-z0-9-]+)\/?$/);
  if (embedMatch) return { module: embedMatch[1], slug: embedMatch[2], embed: true };
  const payMatch = pathname.match(/^\/golf\/([a-z0-9-]+)\/tournaments\/([^/]+)\/teams\/([^/]+)\/pay\/?$/);
  if (payMatch) return { module: "golf-pay", slug: payMatch[1], tournamentId: payMatch[2], teamId: payMatch[3] };
  const m = pathname.match(/^\/(rentals|calendar|golf)\/([a-z0-9-]+)\/?$/);
  return m ? { module: m[1], slug: m[2] } : null;
}

// One hub page plus a dedicated page per module, at clean top-level paths
// (/bell-jar, /rentals, /raffle, /calendar) — any other path on the
// marketing domain falls back to the hub.
function MarketingSite() {
  const onGetStarted = () => { window.location.href = `${APP_URL}/?view=signup`; };
  const onLogin = () => { window.location.href = `${APP_URL}/?view=login`; };

  const slug = window.location.pathname.replace(/^\//, "").replace(/\/$/, "");
  if (MARKETING_MODULES[slug]) return <ModulePage slug={slug} onGetStarted={onGetStarted} onLogin={onLogin} />;
  return <Hub onGetStarted={onGetStarted} onLogin={onLogin} />;
}

export default function App() {
  // `?preview=marketing` is a local/dev-only escape hatch — the marketing
  // site is otherwise only reachable via its real hostname, which local dev
  // never runs on. Harmless in production: it only changes which public
  // marketing content renders, nothing auth- or security-sensitive.
  const isMarketingPreview = new URLSearchParams(window.location.search).get("preview") === "marketing";
  if (MARKETING_HOSTNAMES.includes(window.location.hostname) || isMarketingPreview) {
    return <MarketingSite />;
  }

  const publicMatch = matchPublicPath(window.location.pathname);
  if (publicMatch?.module === "rentals") return <PublicRental slug={publicMatch.slug} embed={publicMatch.embed} />;
  if (publicMatch?.module === "calendar") return <PublicCalendar slug={publicMatch.slug} embed={publicMatch.embed} />;
  if (publicMatch?.module === "golf") return <PublicGolf slug={publicMatch.slug} embed={publicMatch.embed} />;
  if (publicMatch?.module === "golf-pay") return <PublicGolfPay slug={publicMatch.slug} tournamentId={publicMatch.tournamentId} teamId={publicMatch.teamId} />;

  // Needs to render for a logged-out visitor arriving from an email link, so
  // it's handled before AuthProvider/Shell rather than as a route inside it.
  if (window.location.pathname === "/reset-password") return <ResetPassword />;
  if (window.location.pathname === "/raffle-unsubscribe") return <PublicRaffleUnsubscribe />;

  // Requires being logged in (unlike the routes above), so it renders inside
  // AuthProvider as an alternative to Shell rather than before it — it's
  // cross-tenant and single-person, structurally unlike every module Shell
  // renders, which is always scoped to the logged-in user's one org.
  return (
    <AuthProvider>
      {window.location.pathname === "/platform-admin" ? <PlatformAdminApp /> : <Shell />}
    </AuthProvider>
  );
}

import React from "react";
import { colors } from "../lib/tokens";
import { hasModuleTier } from "../lib/modules";

// Every "create/edit/open/close/delete" action across every module's own
// management screen requires an explicit per-module Admin grant on the
// server (requirePermission(module, "Admin") — never an Owner bypass, see
// server/src/lib/auth.js). Being the org's technical Owner does NOT imply
// this, by design: Owner administers permissions and sees everything, but
// editing a specific module is its own explicit grant, same as anyone
// else. Several screens used to either skip this check entirely, or (in
// ManageEvents.jsx's case) check it with a formula that incorrectly gave
// Owner a free pass — both let someone fill out an entire form only to be
// rejected by the server at the very end. This notice surfaces that fact
// up front, before anyone starts typing, and the caller is expected to
// also disable its own admin-only controls (same disabled+title pattern
// Deals.jsx already uses) using the same hasModuleTier() check.
//
// Renders nothing once the caller actually holds Admin on the module —
// zero visual change for the normal case.
export default function AdminAccessNotice({ permissions, moduleKey, moduleLabel, itemLabel }) {
  if (hasModuleTier(permissions, moduleKey, "Admin")) return null;

  // Whoever can reach the Team screen (org-wide Owner, or an Admin on at
  // least one other module — see App.jsx's own canSeeTeam) can fix this
  // themselves in a couple of clicks; anyone else needs to ask someone who
  // can. Mirrors App.jsx's canSeeTeam formula exactly.
  const canSeeTeam = permissions?.orgTier === "Owner" || Object.values(permissions?.moduleGrants || {}).includes("Admin");
  const article = /^[aeiou]/i.test(moduleLabel) ? "an" : "a";

  return (
    <div
      style={{
        background: colors.warningBg,
        color: colors.warning,
        border: `1px solid ${colors.warning}`,
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      You don't have Admin access to {moduleLabel} yet, so you can't create or edit {itemLabel}.{" "}
      {canSeeTeam
        ? "Go to Team (top right) to grant yourself Admin access."
        : `Ask your organization's Owner or ${article} ${moduleLabel} Admin to grant you access.`}
    </div>
  );
}

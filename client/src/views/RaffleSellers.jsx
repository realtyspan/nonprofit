import React, { useEffect, useMemo, useState } from "react";
import { colors, card, pill, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";
import { hasModuleTier } from "../lib/modules";

export default function RaffleSellers({ gameId, permissions }) {
  const isAdmin = hasModuleTier(permissions, "raffle", "Admin") || permissions?.orgTier === "Owner";
  const [users, setUsers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  function refresh() {
    api.listUsers().then(setUsers).catch(() => {});
    if (gameId) api.listRaffleTickets(gameId).then(setTickets).catch(() => {});
    else setTickets([]);
  }
  useEffect(refresh, [gameId]);

  const sellers = users.filter((u) => u.moduleGrants?.raffle);

  const salesBySeller = useMemo(() => {
    const map = {};
    for (const t of tickets) {
      if (!t.assignedSellerId) continue;
      map[t.assignedSellerId] = map[t.assignedSellerId] || { sold: 0, fundsReceived: 0 };
      if (t.status === "sold") map[t.assignedSellerId].sold++;
      if (t.status === "funds_received") map[t.assignedSellerId].fundsReceived++;
    }
    return map;
  }, [tickets]);

  async function changeTier(userId, tier) {
    setBusyId(userId);
    setError("");
    try {
      if (tier) await api.setModuleGrant(userId, "raffle", tier);
      else await api.removeModuleGrant(userId, "raffle");
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Sellers</div>
        <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Everyone with raffle access, and their sales this year. Manage access from Team for full control, or adjust tier here.</div>
      </div>
      {error && <div style={{ padding: "10px 18px", color: colors.danger, fontSize: 12.5 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: isAdmin ? "1.6fr 1fr 1fr 1fr 1fr" : "1.6fr 1fr 1fr 1fr", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
        <div>Name</div>
        <div>Tier</div>
        <div>Sold</div>
        <div>Funds received</div>
        {isAdmin && <div></div>}
      </div>
      {sellers.map((u) => {
        const stats = salesBySeller[u.id] || { sold: 0, fundsReceived: 0 };
        return (
          <div key={u.id} style={{ display: "grid", gridTemplateColumns: isAdmin ? "1.6fr 1fr 1fr 1fr 1fr" : "1.6fr 1fr 1fr 1fr", padding: "12px 18px", alignItems: "center", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13.5 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{u.name}</div>
              <div style={{ fontSize: 11.5, color: colors.textSecondary }}>{u.email}</div>
            </div>
            <div><span style={pill(colors.indigoBg, colors.indigo)}>{u.moduleGrants.raffle}</span></div>
            <div>{stats.sold}</div>
            <div>{stats.fundsReceived}</div>
            {isAdmin && (
              <select
                style={{ ...inputStyle, width: 140 }}
                value={u.moduleGrants.raffle}
                disabled={busyId === u.id}
                onChange={(e) => changeTier(u.id, e.target.value || null)}
              >
                <option value="Viewer">Viewer</option>
                <option value="Helper">Helper</option>
                <option value="Admin">Admin</option>
                <option value="">Remove access</option>
              </select>
            )}
          </div>
        );
      })}
      {sellers.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No one has raffle access yet — add someone from Team.</div>}
    </div>
  );
}

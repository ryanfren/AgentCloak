import { NavLink } from "react-router-dom";
import { LayoutDashboard, Link, Settings, Shield } from "lucide-react";

const links = [
  { to: "/", icon: LayoutDashboard, label: "Overview" },
  { to: "/connections", icon: Link, label: "Connections" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="flex w-56 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-4">
        <Shield className="h-6 w-6 text-emerald-400" />
        <span className="text-lg font-semibold">AgentCloak</span>
      </div>
      <nav className="flex-1 p-2">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

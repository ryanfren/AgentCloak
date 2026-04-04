import { LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export function Header() {
  const { account, logout } = useAuth();

  return (
    <header className="flex items-center justify-end border-b border-zinc-800 px-6 py-3">
      {account && (
        <div className="flex items-center gap-3">
          {account.avatarUrl && (
            <img
              src={account.avatarUrl}
              alt=""
              className="h-7 w-7 rounded-full"
            />
          )}
          <span className="text-sm text-zinc-400">{account.email}</span>
          <button
            onClick={logout}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>
      )}
    </header>
  );
}

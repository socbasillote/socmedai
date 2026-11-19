import { useState } from "react";
import { useNavigate } from "react-router";
import { LogOut } from "lucide-react";

import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/ui/button";

export default function SignOutButton({
  menuItem = false,
}: {
  menuItem?: boolean;
}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setError("");
    setLoading(true);

    try {
      const result = await signOut();

      if (result.error) {
        setError(result.error.message);
        return;
      }

      navigate("/login", { replace: true });
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        role={menuItem ? "menuitem" : undefined}
        data-dropdown-item={menuItem ? "" : undefined}
        className={
          menuItem
            ? "min-h-11 w-full justify-start border-0 bg-transparent px-2 text-slate-200 hover:bg-white/10 hover:text-white"
            : "min-h-11"
        }
        type="button"
        variant="outline"
        size="sm"
        onClick={handleSignOut}
        disabled={loading}
      >
        <LogOut size={16} />
        {loading ? "Signing out..." : "Sign out"}
      </Button>

      {error && (
        <p role="alert" className="max-w-48 text-right text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

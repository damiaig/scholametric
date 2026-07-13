import { Menu } from "lucide-react";
import { GlobalSearch } from "./GlobalSearch";

interface TopBarProps {
  onOpenMobileNav: () => void;
}

export function TopBar({ onOpenMobileNav }: TopBarProps) {
  return (
    <header className="flex items-center gap-3 border-b border-muted/20 bg-card px-4 py-3 sm:px-6">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenMobileNav}
        className="rounded-md p-2 text-muted hover:bg-background md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <GlobalSearch />
    </header>
  );
}

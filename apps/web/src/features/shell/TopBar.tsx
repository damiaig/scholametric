import { Menu, Search } from "lucide-react";
import { Input } from "../../components/ui/input";

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

      <div className="relative w-full max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input placeholder="Search students…" className="pl-9" aria-label="Global search" />
      </div>
    </header>
  );
}

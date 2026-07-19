import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "../components/ui/button";

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  error: Error | null;
}

// Catches a render-time crash in whatever page is currently mounted at
// <Outlet /> (ProtectedLayout.tsx) so one broken page shows a friendly
// message in the content area instead of a blank white screen — the
// sidebar/shell around it stays intact and usable. See docs/DECISIONS.md
// for the crash this was added in response to (a stale Vite dependency
// cache reading an undefined export).
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // eslint-disable-next-line no-console -- only a console.error, same as React's own default; no telemetry backend exists yet.
    console.error("Route crashed:", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <TriangleAlert className="h-8 w-8 text-danger" aria-hidden="true" />
          <p className="text-base font-medium text-text">Something went wrong.</p>
          <p className="text-sm text-muted">This page hit an error. Try again, or reload the page.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            <Button type="button" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

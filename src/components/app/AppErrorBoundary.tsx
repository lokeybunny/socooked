import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  details: string;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
    details: "",
  };

  private handleWindowError = (event: ErrorEvent) => {
    if (event.target && event.target !== window) return;
    const nextError = event.error instanceof Error ? event.error : new Error(event.message || "Unexpected application error");
    this.setState({ error: nextError, details: event.message || nextError.message });
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const nextError = reason instanceof Error ? reason : new Error(typeof reason === "string" ? reason : "Unhandled promise rejection");
    this.setState({ error: nextError, details: nextError.message });
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      error,
      details: error.message,
    };
  }

  componentDidMount() {
    window.addEventListener("error", this.handleWindowError);
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener("error", this.handleWindowError);
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary caught an error", error, info);
    this.setState({ error, details: info.componentStack?.trim() || error.message });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleHome = () => {
    window.location.assign("/");
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <p className="text-sm font-medium text-destructive">App recovered from a crash</p>
            <h1 className="text-2xl font-semibold tracking-tight">Something went wrong, but the app did not white-screen.</h1>
            <p className="text-sm text-muted-foreground">
              You can reload safely. If this keeps happening, the error details below will help pinpoint the failing screen.
            </p>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-muted p-3">
            <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{this.state.details || this.state.error.message}</pre>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={this.handleReload}>Reload app</Button>
            <Button variant="outline" onClick={this.handleHome}>Go home</Button>
          </div>
        </div>
      </div>
    );
  }
}

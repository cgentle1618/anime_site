// Frontend: layout component file for MediaLoadingState.
export default function MediaLoadingState({
  isLoading,
  error,
  loadingText = "Loading...",
  errorTitle = "Error loading data.",
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <i className="fas fa-circle-notch fa-spin text-3xl text-brand mb-4"></i>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
          {loadingText}
        </p>
      </div>
    );
  }

  if (error) {
    const message = typeof error === "string" ? error : error.message;
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-surface border border-border border-l-4 border-l-danger p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-danger mb-1">
            {errorTitle}
          </p>
          <p className="text-sm text-text">{message}</p>
        </div>
      </div>
    );
  }

  return null;
}

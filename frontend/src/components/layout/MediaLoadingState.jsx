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
        <i className="fas fa-circle-notch fa-spin text-4xl text-brand mb-4"></i>
        <p className="text-text-faint font-medium">{loadingText}</p>
      </div>
    );
  }

  if (error) {
    const message = typeof error === "string" ? error : error.message;
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">{errorTitle}</p>
          <p className="text-sm mt-1">{message}</p>
        </div>
      </div>
    );
  }

  return null;
}


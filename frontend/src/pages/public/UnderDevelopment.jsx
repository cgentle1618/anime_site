// Frontend: page component file for UnderDevelopment.
import { Eyebrow } from "../../components/ui/primitives";

export default function UnderDevelopment() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="max-w-md mx-auto border border-dashed border-border-strong px-6 py-10 text-center">
        <Eyebrow className="mb-2">Not filed yet</Eyebrow>
        <h1 className="font-display text-4xl font-semibold text-text leading-none mb-3">
          Under development
        </h1>
        <p className="text-sm text-text-muted">
          This section is still being built. Nothing is stored here yet.
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import FranchiseAcg from "./FranchiseAcg";
import FranchiseReality from "./FranchiseReality";

const REALITY_TYPES = new Set(["TV or Movie"]);

export default function Franchise() {
  const { system_id } = useParams();
  const [franchiseType, setFranchiseType] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/franchise/${system_id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => setFranchiseType(f?.franchise_type ?? null))
      .catch(() => setFranchiseType(null))
      .finally(() => setLoading(false));
  }, [system_id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <i className="fas fa-spinner fa-spin text-brand text-3xl"></i>
      </div>
    );
  }

  if (REALITY_TYPES.has(franchiseType)) return <FranchiseReality />;
  return <FranchiseAcg />;
}

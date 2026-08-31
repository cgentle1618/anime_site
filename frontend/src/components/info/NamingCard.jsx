// Frontend: info component file for NamingCard.
import InfoCard from "./InfoCard";
import { getNamingFields } from "../../utils/media";

export default function NamingCard({ type, item }) {
  const fields = getNamingFields(item, type);
  return <InfoCard title="Naming" fields={fields} />;
}

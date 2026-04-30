import InfoCard from "./InfoCard";

export default function CartoonNamingCard({ cn, en, alt }) {
  const fields = [
    { label: "Chinese", value: cn },
    { label: "English", value: en },
    { label: "Alternative", value: alt },
  ];
  return <InfoCard title="Naming" icon="fa-language" fields={fields} />;
}

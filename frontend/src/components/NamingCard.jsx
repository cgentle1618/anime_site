import InfoCard from "./InfoCard";

export default function NamingCard({ cn, en, alt, jp, roman }) {
  const fields = [
    { label: "Chinese", value: cn },
    { label: "English", value: en },
    { label: "Alternative", value: alt },
    { label: "Japanese", value: jp },
    { label: "Roman", value: roman },
  ];
  return <InfoCard title="Naming" icon="fa-language" fields={fields} />;
}

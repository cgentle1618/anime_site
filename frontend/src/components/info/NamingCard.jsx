import InfoCard from "./InfoCard";

export default function NamingCard({ cn, en, alt, jp, roman }) {
  const fields = [
    { label: "Chinese", value: cn },
    { label: "English", value: en },
    { label: "Japanese", value: jp },
    { label: "Roman", value: roman },
    { label: "Alternative", value: alt },
  ];
  return <InfoCard title="Naming" icon="fa-language" fields={fields} />;
}

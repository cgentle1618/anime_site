import InfoCard from "./InfoCard";

export default function TVNamingCard({
  cn,
  en,
  alt,
  region,
  seasonPart,
  isMain,
  sourceOfficial,
}) {
  const fields = [
    { label: "Chinese", value: cn },
    { label: "English", value: en },
    { label: "Alternative", value: alt },
    [
      { label: "Region", value: region },
      { label: "Season", value: seasonPart },
    ],
    [
      { label: "Classification", value: isMain },
      { label: "Source", value: sourceOfficial },
    ],
  ];
  return <InfoCard title="Naming" icon="fa-language" fields={fields} />;
}

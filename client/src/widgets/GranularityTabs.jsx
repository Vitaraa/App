// Small Day / Month / Year selector shared by the chart widgets.
export default function GranularityTabs({ value, onChange }) {
  const opts = [
    ["day", "D"],
    ["month", "M"],
    ["year", "Y"],
  ];
  return (
    <div className="gran-tabs">
      {opts.map(([key, label]) => (
        <button
          key={key}
          className={`gran-tab ${value === key ? "gran-on" : ""}`}
          onClick={() => onChange(key)}
          title={`By ${key}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

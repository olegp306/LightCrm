const metrics = [
  ["Open reminders", "8"],
  ["Active clients", "24"],
  ["New leads", "13"],
  ["Outbound queue", "41"]
] as const;

export default function HomePage() {
  return (
    <section className="dashboard">
      <div>
        <h1>CRM operating table</h1>
        <p>
          The first LightCrm build keeps work in tables, keeps changes behind core commands, and leaves a clean API path for a future orchestrator.
        </p>
      </div>
      <div className="metricGrid">
        {metrics.map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}


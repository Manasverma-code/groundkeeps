interface StatsCardProps {
  title: string;
  value: string | number;
  color?: 'green' | 'red' | 'yellow';
  subtitle?: string;
}

export function StatsCard({ title, value, color, subtitle }: StatsCardProps) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className={`value ${color ?? ''}`}>{value}</div>
      {subtitle && <p style={{ fontSize: 12, color: '#8899bb', marginTop: 4 }}>{subtitle}</p>}
    </div>
  );
}

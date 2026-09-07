/** Villa detay sayfası ile rezervasyon bileşeninin paylaştığı sunum parçaları. */

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="border-b border-line pb-3.5 font-display text-2xl font-light tracking-[-0.01em] text-ink">
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="font-display text-2xl font-light text-ink">{value}</p>
      <p className="mt-1 text-[0.78rem] text-muted">{label}</p>
    </div>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-line px-3.5 py-1.5 text-[0.82rem] text-ink-soft">{children}</span>;
}

export function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div>
      {label && <dt className="text-muted">{label}</dt>}
      <dd className={label ? 'mt-0.5 text-ink' : 'text-ink'}>{value}</dd>
    </div>
  );
}

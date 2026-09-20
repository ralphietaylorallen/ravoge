const particles = Array.from({ length: 12 }, (_, index) => index);

export function GoldAtmosphere() {
  return (
    <div aria-hidden="true" className="gold-atmosphere">
      <span className="gold-breath" />
      <span className="gold-smoke gold-smoke-one" />
      <span className="gold-smoke gold-smoke-two" />
      <span className="gold-smoke gold-smoke-three" />
      <span className="gold-dust">
        {particles.map((particle) => (
          <i key={particle} />
        ))}
      </span>
    </div>
  );
}

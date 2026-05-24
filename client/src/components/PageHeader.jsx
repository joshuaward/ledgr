export default function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <header className="page-header">
      <div className="page-header__title-block">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div>{children}</div>}
    </header>
  );
}

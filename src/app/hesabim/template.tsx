// template.tsx her gezinmede yeniden mount olur → sayfa geçişlerinde yumuşak belirme animasyonu.
export default function AccountTemplate({ children }: { children: React.ReactNode }) {
  return <div className="acc-page">{children}</div>;
}

import { Award, BookOpen, Crown, KeyRound, LayoutDashboard, Receipt, UserRound } from "lucide-react";

// Profil menüsü (Nav) ve hesap yan menüsü aynı listeden beslenir.
export const ACCOUNT_ITEMS = [
  { href: "/hesabim", label: "Genel bakış", icon: LayoutDashboard, exact: true },
  { href: "/hesabim/kurslarim", label: "Kurslarım", icon: BookOpen },
  { href: "/hesabim/sertifikalarim", label: "Sertifikalarım", icon: Award },
  { href: "/hesabim/siparislerim", label: "Siparişlerim", icon: Receipt },
  { href: "/hesabim/abonelik", label: "Profect Plus", icon: Crown },
  { href: "/hesabim/profil", label: "Profil bilgileri", icon: UserRound },
  { href: "/hesabim/sifre", label: "Şifre ve güvenlik", icon: KeyRound },
] as const;

export function isActiveItem(pathname: string, item: { href: string; exact?: boolean }) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

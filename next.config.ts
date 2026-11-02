import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname) },
  // Sertifika PDF'i çalışma anında font ve logo dosyalarını okur; sunucu paketine dahil edilmeli.
  outputFileTracingIncludes: {
    "/api/public/certificates/[code]/pdf": ["src/assets/fonts/**/*", "public/profect-logo.jpeg"],
    "/sertifika/[code]/opengraph-image": ["src/assets/fonts/**/*", "public/profect-logo.jpeg"],
  },
  // Hediye linki token taşır: başka sitelere Referer ile sızmasın, önbelleğe alınmasın.
  async headers() {
    return [
      {
        source: "/hediye/:token*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      // Kayıt/giriş sayfaları hediye token'ını sorgu parametresinde (?hediye=, ?next=/hediye/…) taşıyabilir.
      { source: "/kayit", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/giris", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;

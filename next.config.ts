import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname) },
  // Sertifika PDF'i çalışma anında font ve logo dosyalarını okur; sunucu paketine dahil edilmeli.
  outputFileTracingIncludes: {
    "/api/public/certificates/[code]/pdf": ["src/assets/fonts/**/*", "public/profect-logo.jpeg"],
  },
};

export default nextConfig;

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS ana ekran simgesi şeffaflığı desteklemez; elmas beyaz zemin üzerine çizilir. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
        <svg width="128" height="128" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <polygon points="32,2 62,32 2,32" fill="#3a5fdc" />
          <polygon points="2,32 62,32 32,62" fill="#4a2a9e" />
        </svg>
      </div>
    ),
    { ...size },
  );
}

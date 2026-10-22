import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Marka elması (globals.css › .brand-diamond): üst yarı mavi, alt yarı mor. */
export default function Icon() {
  return new ImageResponse(
    (
      <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <polygon points="32,3 61,32 3,32" fill="#3a5fdc" />
        <polygon points="3,32 61,32 32,61" fill="#4a2a9e" />
      </svg>
    ),
    { ...size },
  );
}

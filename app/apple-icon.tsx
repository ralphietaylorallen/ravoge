import { ImageResponse } from "next/og";

export const size = { height: 180, width: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ alignItems: "center", background: "#050606", display: "flex", height: "100%", justifyContent: "center", width: "100%" }}>
      <svg height="132" viewBox="0 0 64 64" width="132">
        <path d="m8 7 15.3 9.8L32 14l8.7 2.8L56 7l-5.4 34.8-9.3 12L32 60.5l-9.3-6.7-9.3-12L8 7Z" fill="#F6F5F3" />
        <path d="m8 7 18.3 19.5-12.9 15.3L8 7Zm48 0L37.7 26.5l12.9 15.3L56 7Z" fill="#8A8171" />
        <path d="m23.3 16.8 8.7 18.3L15.6 31l7.7-14.2Zm17.4 0L32 35.1 48.4 31l-7.7-14.2Z" fill="#24312E" />
        <path d="m32 35.1 9.3 18.7L32 60.5l-9.3-6.7L32 35.1Z" fill="#B4AC9B" />
        <path d="m18.5 32.8 8 3-6.8 3-1.2-6Zm27 0-8 3 6.8 3 1.2-6ZM27.1 51l4.9-3 4.9 3-4.9 3.6-4.9-3.6Z" fill="#050606" />
      </svg>
    </div>,
    size,
  );
}

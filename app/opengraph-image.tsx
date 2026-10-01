import { ImageResponse } from "next/og";

export const alt = "Lendhold: borrow against your tokenized stocks on BNB Chain and keep them";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#f6f6f6",
          color: "#1f1f1f",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <path d="M7.5 4.5V20.5A7 7 0 0 0 14.5 27.5H26" fill="none" stroke="#1f1f1f" strokeWidth="5" strokeLinecap="round" />
            <circle cx="20" cy="17.5" r="5" fill="#594ff4" />
          </svg>
          <span style={{ fontSize: 48, letterSpacing: -1 }}>lendhold</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span style={{ fontSize: 84, lineHeight: 1.05, letterSpacing: -2 }}>Borrow against your stocks. Keep them.</span>
          <span style={{ fontSize: 34, color: "#5d5d5d" }}>
            Tokenized US stocks on BNB Chain. See the risk price before you sign.
          </span>
        </div>
      </div>
    ),
    size,
  );
}

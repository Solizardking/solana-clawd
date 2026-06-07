import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "AGENT-AUTH — Directory";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "linear-gradient(180deg, #0a0a0a 0%, #050505 100%)",
        color: "#ededed",
        fontFamily: "monospace",
        padding: "72px 80px",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(to right, #ffffff10 1px, transparent 1px), linear-gradient(to bottom, #ffffff10 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 80%)",
          opacity: 0.4,
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 18,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#ffffff80",
          position: "relative",
        }}
      >
        <span>Agent-Auth</span>
        <span style={{ color: "#ffffff30" }}>/</span>
        <span style={{ color: "#ffffff60" }}>Directory</span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 28,
          position: "relative",
        }}
      >
        <div
          style={{
            fontSize: 76,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            color: "#ffffff",
            maxWidth: 920,
          }}
        >
          Discover agent-auth providers by intent.
        </div>
        <div
          style={{
            fontSize: 26,
            color: "#ffffff70",
            lineHeight: 1.4,
            maxWidth: 840,
          }}
        >
          A searchable directory of Agent Auth-capable services.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 18,
          color: "#ffffff50",
          position: "relative",
        }}
      >
        <span>agent-auth.directory</span>
        <span style={{ color: "#ffffff30" }}>§6.11 — Directory</span>
      </div>
    </div>,
    size,
  );
}

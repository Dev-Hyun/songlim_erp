import type { HospitalListItem } from "./types";

// 실제 네이버지도 기본 마커에 가까운 작은 핀 스타일 (기존 36x44 → 24x30로 축소)
export function makeMarkerSvg(h: Pick<HospitalListItem, "has_equipment" | "is_member">, selected: boolean): string {
  const fill = selected ? "#ED8936" : h.has_equipment ? "#465fff" : "#98A2B3";
  const stroke = selected ? "#B45309" : "#ffffff";
  const scale = selected ? 1.25 : 1;

  const memberDot = h.is_member
    ? `<circle cx="17" cy="4.5" r="4" fill="#12B76A" stroke="white" stroke-width="1.2"/>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${24 * scale}" height="${30 * scale}" viewBox="0 0 22 28">
    <path d="M11 2C5.7 2 1.5 6.1 1.5 11.2c0 7 9.5 14.8 9.5 14.8s9.5-7.8 9.5-14.8C20.5 6.1 16.3 2 11 2z"
          fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
    <circle cx="11" cy="11" r="4" fill="white" opacity="0.95"/>
    ${memberDot}
  </svg>`;

  if (selected) {
    return `<div style="position:relative;width:${24 * scale}px;height:${30 * scale}px">
      <div style="position:absolute;left:6px;top:8px;width:20px;height:20px;border-radius:50%;background:rgba(237,137,54,0.35);animation:songlimPinPulse 1.4s ease-out infinite"></div>
      ${svg}
    </div>`;
  }
  return svg;
}

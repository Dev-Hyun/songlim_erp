"use client";

/** 금액 입력 — 숫자만 받고 입력 중 천 단위 쉼표를 붙인다. 값은 정수(원), 비우면 0. */
export default function MoneyInput({
  value,
  onChange,
  placeholder = "금액",
  invalid = false,
  className = "",
  ariaLabel,
}: {
  value: number | null | undefined;
  onChange: (v: number) => void;
  placeholder?: string;
  invalid?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const shown = value ? value.toLocaleString("ko-KR") : "";
  return (
    <div className={`relative ${className}`}>
      <input
        inputMode="numeric"
        aria-label={ariaLabel || placeholder}
        aria-invalid={invalid}
        className={`field w-full pr-7 text-right tabular-nums ${invalid ? "!border-error-400" : ""}`}
        placeholder={placeholder}
        value={shown}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 11);
          onChange(digits ? Number(digits) : 0);
        }}
      />
      <span className="fg-muted pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ui-xs">원</span>
    </div>
  );
}

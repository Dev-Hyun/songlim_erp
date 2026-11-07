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
        className={`field w-full pr-8 text-right tabular-nums max-sm:pr-10 ${invalid ? "!border-error-400" : ""}`}
        placeholder={placeholder}
        value={shown}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 11);
          onChange(digits ? Number(digits) : 0);
        }}
      />
      {/* 폰은 입력 글자가 16px로 커지므로(iOS 확대 방지) 오른쪽 여백을 더 둔다 */}
      <span className="fg-muted pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ui-xs max-sm:text-ui">원</span>
    </div>
  );
}

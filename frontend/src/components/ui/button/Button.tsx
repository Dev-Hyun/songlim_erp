import React, { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode; // Button text or content
  size?: "sm" | "md" | "lg"; // Button size
  variant?: "primary" | "outline" | "ghost" | "danger"; // Button variant
  startIcon?: ReactNode; // Icon before the text
  endIcon?: ReactNode; // Icon after the text
  onClick?: () => void; // Click handler
  disabled?: boolean; // Disabled state
  className?: string;
}

// 밀도형 기준 높이: sm 28px / md 32px / lg 36px (기존 pill 형태 44~48px 대체)
const sizeClasses = {
  sm: "h-7 px-2 text-ui-sm",
  md: "h-8 px-2.5 text-ui",
  lg: "h-9 px-3.5 text-ui-md",
};

const variantClasses = {
  primary: "btn-primary",
  outline: "btn-default",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

const Button: React.FC<ButtonProps> = ({
  children,
  size = "md",
  variant = "primary",
  startIcon,
  endIcon,
  onClick,
  className = "",
  disabled = false,
}) => {
  return (
    <button
      className={`btn ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {startIcon && <span className="flex items-center">{startIcon}</span>}
      {children}
      {endIcon && <span className="flex items-center">{endIcon}</span>}
    </button>
  );
};

export default Button;

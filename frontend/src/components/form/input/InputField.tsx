import React, { FC } from "react";

interface InputProps {
  type?: "text" | "number" | "email" | "password" | "date" | "time" | string;
  id?: string;
  name?: string;
  placeholder?: string;
  defaultValue?: string | number;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  min?: string;
  max?: string;
  step?: number;
  disabled?: boolean;
  success?: boolean;
  error?: boolean;
  hint?: string; // Optional hint text
}

const Input: FC<InputProps> = ({
  type = "text",
  id,
  name,
  placeholder,
  defaultValue,
  value,
  onChange,
  className = "",
  min,
  max,
  step,
  disabled = false,
  success = false,
  error = false,
  hint,
}) => {
  // Determine input styles based on state (disabled, success, error)
  let inputClasses = `h-9 w-full rounded-control border appearance-none px-3 text-ui-md transition-colors placeholder:text-gray-400 focus:outline-none dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-white/30 ${className}`;

  // Add styles for the different states
  if (disabled) {
    inputClasses += ` cursor-not-allowed bg-gray-50 text-gray-500 border-gray-300 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700`;
  } else if (error) {
    inputClasses += ` bg-white text-error-800 border-error-500 dark:bg-gray-950 dark:text-error-400 dark:border-error-500`;
  } else if (success) {
    inputClasses += ` bg-white text-success-500 border-success-400 dark:bg-gray-950 dark:text-success-400 dark:border-success-500`;
  } else {
    inputClasses += ` bg-white text-gray-800 border-gray-300 focus:border-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90 dark:focus:border-gray-600`;
  }

  return (
    <div className="relative">
      <input
        type={type}
        id={id}
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className={inputClasses}
      />

      {/* Optional Hint Text */}
      {hint && (
        <p
          className={`mt-1.5 text-xs ${
            error
              ? "text-error-500"
              : success
              ? "text-success-500"
              : "text-gray-500"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
};

export default Input;

import React from "react";

interface ComponentCardProps {
  title: string;
  children: React.ReactNode;
  className?: string; // Additional custom classes for styling
  desc?: React.ReactNode; // Description text or content
}

const ComponentCard: React.FC<ComponentCardProps> = ({
  title,
  children,
  className = "",
  desc = "",
}) => {
  return (
    <div
      className={`surface-card flex h-full flex-col ${className}`}
    >
      {/* Card Header */}
      <div className="px-4 py-3">
        <h3 className="card-title">
          {title}
        </h3>
        {desc && (
          <p className="fg-muted mt-0.5 text-ui">
            {desc}
          </p>
        )}
      </div>

      {/* Card Body */}
      <div className="flex-1 overflow-y-auto border-t border-gray-200 p-4 dark:border-gray-800">
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
};

export default ComponentCard;

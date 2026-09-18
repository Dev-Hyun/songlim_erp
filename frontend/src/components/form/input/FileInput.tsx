import React, { FC } from "react";

interface FileInputProps {
  className?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const FileInput: FC<FileInputProps> = ({ className, onChange }) => {
  return (
    <input
      type="file"
      className={`h-9 w-full overflow-hidden rounded-control border border-gray-300 bg-white text-ui-md text-gray-500 transition-colors file:mr-5 file:cursor-pointer file:rounded-l-control file:border-0 file:border-r file:border-solid file:border-gray-200 file:bg-gray-50 file:py-1.5 file:pl-3 file:pr-3 file:text-ui-md file:text-gray-700 hover:file:bg-gray-100 focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400 dark:file:border-gray-800 dark:file:bg-white/[0.06] dark:file:text-gray-300 dark:focus:border-gray-600 ${className}`}
      onChange={onChange}
    />
  );
};

export default FileInput;

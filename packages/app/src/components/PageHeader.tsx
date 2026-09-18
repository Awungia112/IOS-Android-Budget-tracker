import { ReactNode } from "react";

interface PageHeaderProps {
  children: ReactNode;
  className?: string;
}

export function PageHeader({ children, className = "" }: PageHeaderProps) {
  return (
    <div 
      className={`flex flex-col text-black dark:text-white text-base font-bold ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        fontSize: "14px",
        fontFamily: "Inter",
        fontWeight: "700",
        overflowWrap: "break-word",
      }}
    >
      {children}
    </div>
  );
}
import type { PropsWithChildren } from "react";
import { cn } from "../../utils/classnames";

interface CardProps {
  className?: string;
}

export function Card({ className, children }: PropsWithChildren<CardProps>) {
  return <div className={cn("glass p-4 animate-rise", className)}>{children}</div>;
}

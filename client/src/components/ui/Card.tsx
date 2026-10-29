import type { PropsWithChildren } from "react";
import { cn } from "../../utils/classnames";

interface CardProps {
  className?: string;
  /** Turn off the default padding when the card hosts its own header/body. */
  padded?: boolean;
  as?: "div" | "section" | "article";
}

export function Card({
  className,
  padded = true,
  as: Tag = "div",
  children,
}: PropsWithChildren<CardProps>) {
  return (
    <Tag className={cn("surface", padded && "p-5", className)}>{children}</Tag>
  );
}

interface CardHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-title font-semibold tracking-tight text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-meta text-ink-subtle">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

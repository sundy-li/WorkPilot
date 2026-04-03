import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        primary: "border-[var(--accent-strong)] bg-[var(--accent)] text-white shadow-[0_1px_2px_rgba(15,23,42,0.16)] hover:opacity-90",
        secondary: "border-[var(--border)] bg-[var(--panel)] text-[var(--text-primary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:border-[var(--border-strong)] hover:bg-[var(--panel-muted)]",
        ghost: "border-transparent bg-transparent text-[var(--text-secondary)] shadow-none hover:bg-[var(--panel-muted)] hover:text-[var(--text-primary)]"
      },
      size: {
        default: "h-11",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-5 text-base"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, size, variant, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

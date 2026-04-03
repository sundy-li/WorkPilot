import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        primary: "border-neutral-950 bg-neutral-950 text-white shadow-[0_1px_2px_rgba(15,23,42,0.16)] hover:bg-neutral-800",
        secondary: "border-neutral-200 bg-white text-neutral-950 shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:border-neutral-300 hover:bg-neutral-50",
        ghost: "border-transparent bg-transparent text-neutral-600 shadow-none hover:bg-neutral-100 hover:text-neutral-950"
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

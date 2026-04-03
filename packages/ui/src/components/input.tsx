import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm text-neutral-950 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none placeholder:text-neutral-400 focus:border-sky-400 focus-visible:ring-4 focus-visible:ring-sky-100",
        className
      )}
      {...props}
    />
  );
}

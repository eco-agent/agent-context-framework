import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: "primary" | "ghost";
  readonly size?: "default" | "small";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className = "", variant = "primary", size = "default", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`button button--${variant} button--${size} ${className}`.trim()}
      {...props}
    />
  );
});

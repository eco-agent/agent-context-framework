import { forwardRef, type InputHTMLAttributes } from "react";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className = "", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={`checkbox ${className}`.trim()}
      {...props}
    />
  );
});

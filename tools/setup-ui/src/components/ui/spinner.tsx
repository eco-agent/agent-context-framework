import { SpinnerIcon as SpinnerGlyph } from "@phosphor-icons/react/Spinner";

import { cn } from "../../lib/utils.js";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <SpinnerGlyph
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Spinner };

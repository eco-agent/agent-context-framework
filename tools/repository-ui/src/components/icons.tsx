import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>{children}</svg>;
}

export function FolderIcon(props: IconProps) { return <Icon {...props}><path d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></Icon>; }
export function RefreshIcon(props: IconProps) { return <Icon {...props}><path d="M20 7v5h-5" /><path d="M18.2 16.5A8 8 0 1 1 19.5 9" /></Icon>; }
export function SearchIcon(props: IconProps) { return <Icon {...props}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></Icon>; }
export function PlusIcon(props: IconProps) { return <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>; }
export function SyncIcon(props: IconProps) { return <Icon {...props}><path d="M4 8a8 8 0 0 1 13.5-2L20 8.5" /><path d="M20 4v4.5h-4.5M20 16a8 8 0 0 1-13.5 2L4 15.5" /><path d="M4 20v-4.5h4.5" /></Icon>; }
export function TrashIcon(props: IconProps) { return <Icon {...props}><path d="M5 7h14M9 7V4.5h6V7M7.5 7l.7 12h7.6l.7-12M10 10.5v5M14 10.5v5" /></Icon>; }
export function ChevronIcon(props: IconProps) { return <Icon {...props}><path d="m9 6 6 6-6 6" /></Icon>; }

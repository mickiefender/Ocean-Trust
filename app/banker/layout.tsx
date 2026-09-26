import { BankerShell } from "./BankerShell";

export default function BankerLayout({ children }: { children: React.ReactNode }) {
  return <BankerShell>{children}</BankerShell>;
}

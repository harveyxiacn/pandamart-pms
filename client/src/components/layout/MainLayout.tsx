import type { PropsWithChildren } from "react";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

export function MainLayout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar />
      <main className="flex-1 p-3 pb-24 lg:p-6 lg:pb-6">
        <Header />
        <div className="space-y-4">{children}</div>
      </main>
      <MobileNav />
    </div>
  );
}

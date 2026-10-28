import type { PropsWithChildren } from "react";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

export function MainLayout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-dvh lg:flex">
      {/* Keyboard users should not have to tab through 15 nav links on every page. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        跳到主要内容
      </a>
      <Sidebar />
      <main id="main-content" className="flex-1 p-3 pb-24 lg:p-6 lg:pb-6">
        <Header />
        <div className="space-y-4">{children}</div>
      </main>
      <MobileNav />
    </div>
  );
}

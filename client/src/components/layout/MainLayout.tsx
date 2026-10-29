import type { PropsWithChildren } from "react";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

export function MainLayout({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-dvh bg-surface-muted">
      {/* Keyboard users should not have to tab through 15 nav links on every page. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        跳到主要内容
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main
          id="main-content"
          className="flex-1 px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-5 lg:px-7 lg:pb-10 lg:pt-6"
        >
          <div className="mx-auto w-full max-w-[1400px] space-y-5 animate-rise lg:space-y-6">
            {children}
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

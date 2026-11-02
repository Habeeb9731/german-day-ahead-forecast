"use client";

import { Menu, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const LINKS = [
  { href: "/", label: "Tomorrow" },
  { href: "/track-record/", label: "Track record" },
  { href: "/model/", label: "Model" },
  { href: "/ev-charging/", label: "EV charging" },
  { href: "/about/", label: "About" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const normalized = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return LINKS.map((link) => {
    const active = normalized === link.href;
    return (
      <Button
        key={link.href}
        asChild
        variant="ghost"
        size="default"
        className={active ? "justify-start bg-accent! text-accent-foreground!" : "justify-start text-muted-foreground"}
      >
        <Link href={link.href} aria-current={active ? "page" : undefined} onClick={onNavigate}>
          {link.label}
        </Link>
      </Button>
    );
  });
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-background">
      <div className="flex h-16 w-full items-center justify-between gap-2 px-4 lg:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Zap className="size-4" aria-hidden />
          </span>
          <span className="truncate font-heading text-lg font-medium">
            DE-LU <span className="hidden sm:inline">day-ahead </span>forecast
          </span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <NavLinks />
        </nav>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="secondary" size="icon" className="bg-card md:hidden" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription className="sr-only">Site pages</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                <NavLinks onNavigate={() => setOpen(false)} />
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

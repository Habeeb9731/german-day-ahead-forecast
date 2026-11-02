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
        variant={active ? "secondary" : "ghost"}
        size="sm"
        className="justify-start"
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
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="flex h-14 w-full items-center justify-between gap-2 px-4 lg:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Zap className="size-4 shrink-0" aria-hidden />
          <span className="truncate">DE-LU day-ahead forecast</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <NavLinks />
        </nav>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden" aria-label="Open menu">
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

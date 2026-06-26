"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bell, Search } from "lucide-react";
import { Logo } from "@/components/common/logo";

interface HeaderProps {
  user: { email: string; name?: string | null } | null;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ user, title, subtitle, actions }: HeaderProps) {
  const initials = (user?.name || user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-800/60 bg-slate-950/60 backdrop-blur-xl">
      <div className="flex items-center gap-3 min-w-0">
        <div className="lg:hidden">
          <Logo size="sm" showText={false} />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-white truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs text-slate-400 truncate hidden sm:block">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {actions}
        <Button variant="ghost" size="icon" className="hidden sm:flex text-slate-400 hover:text-slate-100">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="relative text-slate-400 hover:text-slate-100">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-cyan-400" />
        </Button>
        <Avatar className="h-9 w-9 border border-slate-700">
          <AvatarFallback className="bg-gradient-to-br from-cyan-500/30 to-emerald-500/30 text-cyan-200 text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}

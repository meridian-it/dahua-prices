"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const toggle = () => {
    const el = document.documentElement;
    const dark = !el.classList.contains("dark");
    el.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  };
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={toggle} aria-label="Сменить тему" />}>
        <Sun className="hidden dark:block" />
        <Moon className="dark:hidden" />
      </TooltipTrigger>
      <TooltipContent>Светлая / тёмная тема</TooltipContent>
    </Tooltip>
  );
}

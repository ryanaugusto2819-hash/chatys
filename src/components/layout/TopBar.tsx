import { Bell, Moon, Sun, Sparkles, Search } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useState } from 'react';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const [notifications] = useState(3);

  return (
    <header
      className="sticky top-0 z-30 flex h-16 items-center justify-between border-b px-6"
      style={{
        background: 'hsl(var(--background) / 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderColor: 'hsl(var(--border))',
        boxShadow: '0 1px 0 hsl(var(--border)), 0 4px 16px hsl(var(--background) / 0.8)',
      }}
    >
      {/* Left — title */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-foreground tracking-tight leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground font-medium leading-tight">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Search button */}
        <button
          className="hidden sm:flex items-center gap-2 h-9 rounded-xl px-3 text-xs font-medium text-muted-foreground transition-all duration-150 hover:bg-secondary hover:text-foreground border border-border/60"
          style={{ minWidth: 160 }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">Pesquisar...</span>
          <kbd
            className="hidden md:inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] border"
            style={{
              background: 'hsl(var(--muted))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            ⌘K
          </kbd>
        </button>

        {/* AI indicator */}
        <div
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
          style={{
            background: 'rgba(124,58,237,0.08)',
            border: '1px solid rgba(124,58,237,0.18)',
          }}
        >
          <Sparkles
            className="h-3 w-3 animate-pulse-dot"
            style={{ color: '#A78BFA' }}
          />
          <span className="text-[11px] font-semibold" style={{ color: '#7C3AED' }}>
            IA Ativa
          </span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition-all duration-150"
          title={theme === 'light' ? 'Modo escuro' : 'Modo claro'}
        >
          {theme === 'light'
            ? <Moon className="h-[17px] w-[17px]" />
            : <Sun className="h-[17px] w-[17px]" />}
        </button>

        {/* Notifications */}
        <button className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition-all duration-150">
          <Bell className="h-[17px] w-[17px]" />
          {notifications > 0 && (
            <span
              className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white leading-none"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)' }}
            >
              {notifications}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

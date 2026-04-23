import { NavLink, Outlet } from 'react-router-dom';
import { Building2, Bot, Users, CreditCard } from 'lucide-react';

const NAV = [
  { to: '/settings/workspace', icon: Building2, label: 'Workspace'  },
  { to: '/settings/ai',        icon: Bot,       label: 'Inteligência Artificial' },
  { to: '/settings/team',      icon: Users,     label: 'Equipe'     },
  { to: '/settings/billing',   icon: CreditCard, label: 'Plano e Cobrança' },
];

export default function SettingsLayout() {
  return (
    <div className="flex gap-8 p-6 min-h-full">
      {/* Sidebar */}
      <nav className="w-52 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-2">
          Configurações
        </p>
        <ul className="space-y-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

import { ChevronDown, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useWorkspace, getCountryFlag } from '@/contexts/WorkspaceContext';

export default function WorkspaceSwitcher() {
  const { workspaces, currentWorkspace, switchWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!currentWorkspace) return null;

  // Don't show switcher if user has only one workspace
  if (workspaces.length <= 1) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2 mx-3 mb-1"
        style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.12)' }}
      >
        <span className="text-lg leading-none">
          {getCountryFlag(currentWorkspace.country)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate" style={{ color: '#C4B5FD' }}>
            {currentWorkspace.name}
          </p>
          <p className="text-[10px]" style={{ color: 'hsl(260 15% 42%)' }}>
            {currentWorkspace.country === 'BR' ? 'Brasil' :
             currentWorkspace.country === 'UY' ? 'Uruguay' : currentWorkspace.country}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative mx-3 mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 rounded-xl px-3 py-2 transition-all duration-150"
        style={{
          background: open ? 'rgba(124,58,237,0.15)' : 'rgba(124,58,237,0.08)',
          border: '1px solid rgba(124,58,237,0.12)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.15)';
        }}
        onMouseLeave={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.08)';
        }}
      >
        <span className="text-lg leading-none shrink-0">
          {getCountryFlag(currentWorkspace.country)}
        </span>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-xs font-semibold truncate" style={{ color: '#C4B5FD' }}>
            {currentWorkspace.name}
          </p>
          <p className="text-[10px]" style={{ color: 'hsl(260 15% 42%)' }}>
            Trocar conta
          </p>
        </div>
        <ChevronDown
          className="h-3 w-3 shrink-0 transition-transform duration-150"
          style={{
            color: 'hsl(260 15% 42%)',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-50 py-1"
          style={{
            background: '#1A1225',
            border: '1px solid rgba(124,58,237,0.2)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => {
                switchWorkspace(ws.id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-100"
              style={{ color: ws.id === currentWorkspace.id ? '#C4B5FD' : 'hsl(260 15% 52%)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.08)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <span className="text-base leading-none shrink-0">
                {getCountryFlag(ws.country)}
              </span>
              <span className="text-sm font-medium flex-1 truncate">{ws.name}</span>
              {ws.id === currentWorkspace.id && (
                <Check className="h-3.5 w-3.5 shrink-0" style={{ color: '#A78BFA' }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { Building2, Search, Moon, Sun, Rows3 } from 'lucide-react';
import type { CompanyProfile } from '../../types/accounting';
import { cn } from '../ui/cn';
import { Button } from '../ui/Button';
import type { Density, ThemeMode } from '../../theme/useTheme';

export const Topbar: React.FC<{
  company: CompanyProfile;
  appTitle: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  theme: ThemeMode;
  density: Density;
  onToggleTheme: () => void;
  onToggleDensity: () => void;
}> = ({
  company,
  appTitle,
  subtitle,
  rightSlot,
  theme,
  density,
  onToggleTheme,
  onToggleDensity,
}) => {
  return (
    <header
      className={cn(
        'h-[var(--topbar-height)] sticky top-0 z-40',
        'bg-[var(--bg-chrome)] border-b border-[var(--border-subtle)]',
      )}
    >
      <div className="h-full px-3 sm:px-4 flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              'h-8 w-8 rounded-[var(--radius-md)]',
              'bg-[var(--accent-solid)] text-white',
              'flex items-center justify-center font-semibold',
            )}
            aria-hidden="true"
          >
            B
          </div>
          <div className="min-w-0">
            <div className="text-[length:var(--text-sm)] font-semibold leading-tight truncate">
              {appTitle}
            </div>
            {subtitle && (
              <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] leading-tight truncate">
                {subtitle}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-2 min-w-[280px] max-w-[440px] flex-1">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-[var(--text-tertiary)] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              className={cn(
                'w-full h-[var(--control-height)] pl-8 pr-2.5',
                'rounded-[var(--radius-md)]',
                'bg-[var(--bg-surface)] border border-[var(--border-default)]',
                'text-[length:var(--text-xs)]',
                'focus:outline-none focus:border-[var(--border-focus)]',
              )}
              placeholder="Recherche (facture, client, BCE, OGM…)"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'}
            className="h-[var(--control-height-sm)] px-2"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
            <span className="hidden lg:inline">{theme === 'dark' ? 'Clair' : 'Sombre'}</span>
          </Button>
          <Button
            variant="ghost"
            onClick={onToggleDensity}
            title={density === 'compact' ? 'Densité confortable' : 'Densité compacte'}
            className="h-[var(--control-height-sm)] px-2"
          >
            <Rows3 className="w-4 h-4" />
            <span className="hidden lg:inline">{density === 'compact' ? 'Compact' : 'Confort'}</span>
          </Button>

          {rightSlot}

          <div className="hidden sm:flex items-center gap-2 pl-2 ml-1 border-l border-[var(--border-subtle)]">
            <div className="h-8 w-8 rounded-[var(--radius-full)] bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center text-[var(--text-tertiary)]">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="text-left text-[length:var(--text-2xs)] leading-tight">
              <div className="font-semibold text-[var(--text-primary)] max-w-[220px] truncate">
                {company.name}
              </div>
              <div className="font-mono tnum text-[var(--text-tertiary)]">{company.bceNumber}</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

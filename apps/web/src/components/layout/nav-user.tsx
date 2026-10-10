import { useNavigate } from 'react-router-dom';
import { ChevronsUpDownIcon, LogOutIcon, MonitorIcon, MoonIcon, SettingsIcon, SunIcon } from 'lucide-react';
import { useTheme, type Theme } from '@/components/theme-provider';
import type { Me } from '@cloudattend/shared';
import { useAuth } from '@/auth/auth-context';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('') || '?';
}

export function NavUser({ me }: { me: Me }) {
  const { isMobile } = useSidebar();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const identity = (
    <>
      <Avatar className="size-8 rounded-lg"><AvatarFallback className="rounded-lg">{initials(me.name)}</AvatarFallback></Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{me.name}</span>
        <span className="truncate text-xs text-muted-foreground">{me.email}</span>
      </div>
    </>
  );
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent" aria-label="Account menu">
              {identity}
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side={isMobile ? 'bottom' : 'right'} align="end" sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5">{identity}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => navigate('/settings')}><SettingsIcon />Settings</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><SunIcon />Theme</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
                    <DropdownMenuRadioItem value="light"><SunIcon />Light</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark"><MoonIcon />Dark</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system"><MonitorIcon />System</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}><LogOutIcon />Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

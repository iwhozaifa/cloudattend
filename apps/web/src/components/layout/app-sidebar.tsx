import { Link, NavLink, useLocation } from 'react-router-dom';
import { BookOpenIcon, ClipboardListIcon, LayoutDashboardIcon, QrCodeIcon, SettingsIcon, UsersIcon, type LucideIcon } from 'lucide-react';
import type { Me } from '@cloudattend/shared';
import { AppLogo } from '@/components/app-logo';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar
} from '@/components/ui/sidebar';
import { NavUser } from './nav-user';

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

export function navigationFor(me: Me): { label: string; items: NavItem[] }[] {
  const main: NavItem[] = me.role === 'TEACHER'
    ? [{ to: '/', label: 'My courses', icon: BookOpenIcon, end: true }]
    : [
      { to: '/', label: 'Dashboard', icon: LayoutDashboardIcon, end: true },
      { to: '/scan', label: 'Scan QR code', icon: QrCodeIcon },
      { to: '/attendance', label: 'My attendance', icon: ClipboardListIcon }
    ];
  const groups = [{ label: me.role === 'TEACHER' ? 'Teaching' : 'Student', items: main }];
  if (me.isAdmin) groups.push({ label: 'Administration', items: [{ to: '/admin/users', label: 'Users & roles', icon: UsersIcon }] });
  groups.push({ label: 'Account', items: [{ to: '/settings', label: 'Settings', icon: SettingsIcon }] });
  return groups;
}

/** Collapsible sidebar based on the shadcn `sidebar-07` block, with role-aware navigation. */
export function AppSidebar({ me }: { me: Me }) {
  const { setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="CloudAttend">
              <Link to="/" onClick={() => setOpenMobile(false)}><AppLogo className="[&>span:first-child]:size-8" /></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navigationFor(me).map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={item.end ? pathname === item.to : pathname.startsWith(item.to)} tooltip={item.label}>
                      <NavLink to={item.to} end={item.end} onClick={() => setOpenMobile(false)}><item.icon /><span>{item.label}</span></NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter><NavUser me={me} /></SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

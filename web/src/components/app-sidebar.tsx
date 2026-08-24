"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FolderKanban, ListTodo, LogOut, UserRound } from "lucide-react";
import { useState } from "react";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/client";

const navigation = [
	{ href: "/projects", label: "Projects", icon: FolderKanban },
	{ href: "/issues", label: "Issues", icon: ListTodo },
];

type AppSidebarProps = {
	user: {
		email: string;
		name: string;
	};
};

export function AppSidebar({ user }: AppSidebarProps) {
	const pathname = usePathname();
	const router = useRouter();
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

	const handleLogout = async () => {
		setIsLoggingOut(true);
		const supabase = createClient();
		await supabase.auth.signOut();
		router.replace("/");
		router.refresh();
	};

	return (
		<Sidebar collapsible="icon">
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Workspace</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{navigation.map(({ href, label, icon: Icon }) => (
								<SidebarMenuItem key={href}>
									<SidebarMenuButton
										isActive={
											pathname === href || pathname.startsWith(`${href}/`)
										}
										render={<Link href={href} />}
										tooltip={label}
									>
										<Icon />
										<span>{label}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter className="p-2">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							aria-expanded={isUserMenuOpen}
							onClick={() => setIsUserMenuOpen((open) => !open)}
							size="lg"
							tooltip="Account"
						>
							<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
								<UserRound className="size-4" />
							</span>
							<span className="min-w-0">
								<span className="block truncate text-sm font-medium">
									{user.name}
								</span>
								<span className="block truncate text-xs text-sidebar-foreground/60">
									{user.email}
								</span>
							</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
					{isUserMenuOpen && (
						<SidebarMenuItem>
							<SidebarMenuButton
								disabled={isLoggingOut}
								onClick={handleLogout}
								tooltip="Log out"
							>
								<LogOut />
								<span>{isLoggingOut ? "Logging out…" : "Log out"}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)}
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}

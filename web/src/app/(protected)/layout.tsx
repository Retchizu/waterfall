import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({
	children,
}: {
	children: ReactNode;
}) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		redirect("/");
	}

	return (
		<SidebarProvider>
			<AppSidebar
				user={{
					email: user.email ?? "",
					name: user.user_metadata.username ?? user.email ?? "User",
				}}
			/>
			<SidebarInset>
				<header className="flex h-14 shrink-0 items-center border-b border-slate-200 px-4">
					<SidebarTrigger className="md:hidden" />
				</header>
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}

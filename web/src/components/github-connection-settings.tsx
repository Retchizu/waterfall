import { GitPullRequest } from "lucide-react";

import type { GitHubInstallation, GitHubRepository } from "@/lib/supabase/database.types";

type Props = {
	installations: GitHubInstallation[];
	installUrl?: string;
	repositories: GitHubRepository[];
};

function formatDeliveryTime(value: string | null) {
	if (!value) return "No successful webhook deliveries yet";
	return `Last delivery ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))}`;
}

export function GitHubConnectionSettings({ installations, installUrl, repositories }: Props) {
	return (
		<section className="mx-auto w-full max-w-3xl px-6 pb-2 pt-2 sm:px-8 lg:px-10">
			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
				<div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-4 py-4">
					<div>
						<div className="flex items-center gap-2"><GitPullRequest aria-hidden="true" className="size-5" /><h2 className="font-semibold text-slate-950">GitHub</h2></div>
						<p className="mt-1 text-sm text-slate-500">Link GitHub branches such as <code className="rounded bg-slate-200 px-1 py-0.5 text-xs text-slate-700">feat/APP-12-settings</code> to Waterfall issues.</p>
					</div>
					{installUrl ? <a className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800" href={installUrl}>Connect GitHub</a> : <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">Set NEXT_PUBLIC_GITHUB_APP_INSTALL_URL to enable installation.</span>}
				</div>
				{installations.length === 0 ? <p className="p-4 text-sm text-slate-500">No GitHub App installations are connected.</p> : <div>{installations.map((installation) => { const connectedRepositories = repositories.filter((repository) => repository.installation_id === installation.id); return <div className="border-b border-slate-100 p-4 last:border-0" key={installation.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-slate-950">{installation.github_account_login ?? `Installation ${installation.github_installation_id}`}</p><span className={`rounded-full px-2 py-1 text-xs font-medium ${installation.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{installation.status}</span></div>{connectedRepositories.length ? <ul className="mt-3 grid gap-2">{connectedRepositories.map((repository) => <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm" key={repository.id}><span className="font-medium text-slate-700">{repository.full_name}</span><span className={repository.is_active ? "text-xs text-emerald-700" : "text-xs text-slate-500"}>{repository.is_active ? formatDeliveryTime(repository.last_successful_delivery_at) : "Disabled"}</span></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">Waiting for GitHub to send the installation repository event.</p>}</div>; })}</div>}
			</div>
			<p className="px-4 py-3 text-xs text-slate-500">The GitHub App needs repository metadata and pull-request read access only. Its webhook secret and private key stay in server-side Supabase secrets.</p>
		</section>
	);
}

import Markdown, { defaultUrlTransform } from "react-markdown";

import { cn } from "@/lib/utils";

type MarkdownDescriptionProps = {
	children: string;
	className?: string;
	compact?: boolean;
};

/** Renders untrusted CommonMark without enabling raw HTML parsing. */
export function MarkdownDescription({
	children,
	className,
	compact = false,
}: MarkdownDescriptionProps) {
	return (
		<div
			className={cn(
				"text-sm leading-6 text-slate-500 [&_a]:font-medium [&_a]:text-sky-700 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-sky-800 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem] [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-slate-900 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h3]:font-medium [&_h3]:text-slate-900 [&_li]:ml-5 [&_ol]:list-decimal [&_p:not(:last-child)]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-950 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-slate-100 [&_ul]:list-disc",
				compact && "max-h-24 overflow-hidden",
				className,
			)}
		>
			<Markdown
				components={{
					a: ({ children: linkChildren, href, node, ...props }) => {
						void node;
						return (
							<a {...props} href={href} rel="noreferrer noopener" target="_blank">
								{linkChildren}
							</a>
						);
					},
				}}
				urlTransform={defaultUrlTransform}
			>
				{children}
			</Markdown>
		</div>
	);
}

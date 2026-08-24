"use client";

import { SubmitEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PasswordFieldProps = {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
};

function EyeIcon({ crossed = false }: { crossed?: boolean }) {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="20"
			stroke="currentColor"
			strokeWidth="1.8"
			viewBox="0 0 24 24"
			width="20"
		>
			<path d="M2.25 12S5.75 5.25 12 5.25 21.75 12 21.75 12 18.25 18.75 12 18.75 2.25 12 2.25 12Z" />
			<circle cx="12" cy="12" r="2.75" />
			{crossed && <path d="m3 3 18 18" />}
		</svg>
	);
}

function PasswordField({
	id,
	label,
	value,
	onChange,
	placeholder = "Enter your password",
}: PasswordFieldProps) {
	const [isVisible, setIsVisible] = useState(false);
	return (
		<div>
			<label
				className="mb-2 block text-sm font-medium text-slate-700"
				htmlFor={id}
			>
				{label}
			</label>
			<div className="relative">
				<input
					autoComplete={
						id === "login-password" ? "current-password" : "new-password"
					}
					className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
					id={id}
					onChange={(event) => onChange(event.target.value)}
					placeholder={placeholder}
					required
					type={isVisible ? "text" : "password"}
					value={value}
				/>
				<button
					aria-label={
						isVisible
							? `Hide ${label.toLowerCase()}`
							: `Show ${label.toLowerCase()}`
					}
					className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 transition hover:text-slate-700"
					onClick={() => setIsVisible((visible) => !visible)}
					type="button"
				>
					<EyeIcon crossed={isVisible} />
				</button>
			</div>
		</div>
	);
}

const inputClass =
	"h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100";
type AuthMessage = { type: "error" | "success"; text: string } | null;

export default function Home() {
	const router = useRouter();
	const [mode, setMode] = useState<"login" | "register">("login");
	const [loginForm, setLoginForm] = useState({ email: "", password: "" });
	const [registerForm, setRegisterForm] = useState({
		email: "",
		username: "",
		password: "",
		confirmPassword: "",
	});
	const [authMessage, setAuthMessage] = useState<AuthMessage>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isLogin = mode === "login";
	const changeMode = (nextMode: "login" | "register") => {
		setMode(nextMode);
		setAuthMessage(null);
	};

	const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
		event.preventDefault();
		setAuthMessage(null);

		const form = isLogin ? loginForm : registerForm;
		if (!form.email.trim() || !form.password) {
			setAuthMessage({
				type: "error",
				text: "Enter your email address and password.",
			});
			return;
		}

		if (!isLogin) {
			if (!registerForm.username.trim()) {
				setAuthMessage({
					type: "error",
					text: "Choose a username to continue.",
				});
				return;
			}
			if (registerForm.password !== registerForm.confirmPassword) {
				setAuthMessage({ type: "error", text: "Your passwords do not match." });
				return;
			}
		}

		setIsSubmitting(true);
		try {
			const supabase = createClient();
			if (isLogin) {
				const { error } = await supabase.auth.signInWithPassword({
					email: loginForm.email.trim(),
					password: loginForm.password,
				});
				if (error) throw error;

				router.replace("/projects");
				router.refresh();
			} else {
				const { data, error } = await supabase.auth.signUp({
					email: registerForm.email.trim(),
					password: registerForm.password,
					options: { data: { username: registerForm.username.trim() } },
				});
				if (error) throw error;

				setAuthMessage({
					type: "success",
					text: data.session
						? "Your account is ready and you’re logged in."
						: "Check your email to confirm your account, then come back to log in.",
				});
			}
		} catch (error) {
			setAuthMessage({
				type: "error",
				text:
					error instanceof Error
						? error.message
						: "Something went wrong. Please try again.",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<main className="min-h-screen bg-[#f6f9fc] p-5 sm:p-8">
			<div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl shadow-slate-200/60 lg:grid-cols-[1.05fr_0.95fr]">
				<section className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
					<div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
					<div className="absolute -bottom-28 -right-20 h-96 w-96 rounded-full bg-indigo-500/30 blur-3xl" />
					<div className="relative text-lg font-semibold tracking-tight">
						Waterfall
					</div>
					<div className="relative max-w-md">
						<p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">
							Welcome aboard
						</p>
						<h1 className="text-5xl font-semibold leading-tight tracking-tight">
							A calmer flow for your work.
						</h1>
						<p className="mt-6 max-w-sm text-lg leading-8 text-slate-300">
							Keep your projects moving with a workspace that feels clear,
							focused, and easy to return to.
						</p>
					</div>
					<p className="relative text-sm text-slate-400">© 2026 Waterfall</p>
				</section>
				<section className="flex items-center justify-center px-6 py-12 sm:px-12 lg:px-16">
					<div className="w-full max-w-md">
						<div className="mb-10 lg:hidden">
							<div className="text-lg font-semibold text-slate-900">
								Waterfall
							</div>
						</div>
						<div className="mb-8">
							<h2 className="text-3xl font-semibold tracking-tight text-slate-900">
								{isLogin ? "Welcome back" : "Create your account"}
							</h2>
							<p className="mt-2 text-slate-500">
								{isLogin
									? "Enter your details to continue to Waterfall."
									: "Start organizing your work in a few moments."}
							</p>
						</div>
						<div
							className="mb-8 grid grid-cols-2 rounded-xl bg-slate-100 p-1"
							role="tablist"
						>
							<button
								aria-selected={isLogin}
								className={`rounded-lg py-2.5 text-sm font-medium transition ${isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
								onClick={() => changeMode("login")}
								role="tab"
								type="button"
							>
								Log in
							</button>
							<button
								aria-selected={!isLogin}
								className={`rounded-lg py-2.5 text-sm font-medium transition ${!isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
								onClick={() => changeMode("register")}
								role="tab"
								type="button"
							>
								Register
							</button>
						</div>
						{authMessage && (
							<p
								aria-live="polite"
								className={`mb-5 rounded-xl px-4 py-3 text-sm ${authMessage.type === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
								role={authMessage.type === "error" ? "alert" : "status"}
							>
								{authMessage.text}
							</p>
						)}
						{isLogin ? (
							<form className="space-y-5" onSubmit={handleSubmit}>
								<div>
									<label
										className="mb-2 block text-sm font-medium text-slate-700"
										htmlFor="login-email"
									>
										Email address
									</label>
									<input
										autoComplete="email"
										className={inputClass}
										id="login-email"
										onChange={(event) =>
											setLoginForm({ ...loginForm, email: event.target.value })
										}
										placeholder="you@example.com"
										required
										type="email"
										value={loginForm.email}
									/>
								</div>
								<PasswordField
									id="login-password"
									label="Password"
									onChange={(password) =>
										setLoginForm({ ...loginForm, password })
									}
									value={loginForm.password}
								/>
								<button
									className="h-12 w-full rounded-xl bg-sky-500 font-semibold text-white transition hover:bg-sky-600 focus:outline-none focus:ring-4 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-70"
									disabled={isSubmitting}
									type="submit"
								>
									{isSubmitting ? "Logging in…" : "Log in"}
								</button>
							</form>
						) : (
							<form className="space-y-5" onSubmit={handleSubmit}>
								<div>
									<label
										className="mb-2 block text-sm font-medium text-slate-700"
										htmlFor="register-email"
									>
										Email address
									</label>
									<input
										autoComplete="email"
										className={inputClass}
										id="register-email"
										onChange={(event) =>
											setRegisterForm({
												...registerForm,
												email: event.target.value,
											})
										}
										placeholder="you@example.com"
										required
										type="email"
										value={registerForm.email}
									/>
								</div>
								<div>
									<label
										className="mb-2 block text-sm font-medium text-slate-700"
										htmlFor="username"
									>
										Username
									</label>
									<input
										autoComplete="username"
										className={inputClass}
										id="username"
										onChange={(event) =>
											setRegisterForm({
												...registerForm,
												username: event.target.value,
											})
										}
										placeholder="Choose a username"
										required
										type="text"
										value={registerForm.username}
									/>
								</div>
								<PasswordField
									id="register-password"
									label="Password"
									onChange={(password) =>
										setRegisterForm({ ...registerForm, password })
									}
									value={registerForm.password}
								/>
								<PasswordField
									id="confirm-password"
									label="Confirm password"
									onChange={(confirmPassword) =>
										setRegisterForm({ ...registerForm, confirmPassword })
									}
									placeholder="Re-enter your password"
									value={registerForm.confirmPassword}
								/>
								<button
									className="h-12 w-full rounded-xl bg-sky-500 font-semibold text-white transition hover:bg-sky-600 focus:outline-none focus:ring-4 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-70"
									disabled={isSubmitting}
									type="submit"
								>
									{isSubmitting ? "Creating account…" : "Create account"}
								</button>
							</form>
						)}
					</div>
				</section>
			</div>
		</main>
	);
}

import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline";
import { createSupabaseClient, saveSession } from "./auth-session";

function ask(question: string): Promise<string> {
	const terminal = readline.createInterface({ input, output });
	return new Promise((resolve) => {
		terminal.question(question, (answer) => {
			terminal.close();
			resolve(answer);
		});
	});
}

function askPassword(question: string): Promise<string> {
	output.write(question);
	input.setRawMode(true);
	input.resume();

	return new Promise((resolve, reject) => {
		let password = "";
		const finish = () => {
			input.setRawMode(false);
			input.off("data", onData);
			output.write("\n");
			resolve(password);
		};
		const onData = (chunk: Buffer) => {
			const value = chunk.toString("utf8");
			if (value === "\r" || value === "\n") return finish();
			if (value === "\u0003") {
				input.setRawMode(false);
				input.off("data", onData);
				return reject(new Error("Sign-in cancelled."));
			}
			if (value === "\b" || value === "\u007f") {
				if (password) {
					password = password.slice(0, -1);
					output.write("\b \b");
				}
				return;
			}

			password += value;
			output.write("*".repeat(value.length));
		};
		input.on("data", onData);
	});
}

async function main(): Promise<void> {
	if (!input.isTTY || !output.isTTY) {
		throw new Error(
			"`pnpm mcp:login` must be run from an interactive terminal.",
		);
	}

	const email = (await ask("Waterfall email: ")).trim();
	const password = await askPassword("Waterfall password: ");
	if (!email || !password) throw new Error("Email and password are required.");

	const supabase = createSupabaseClient();
	const { data, error } = await supabase.auth.signInWithPassword({
		email,
		password,
	});
	if (error || !data.session)
		throw error ?? new Error("Waterfall did not return a session.");

	await saveSession(data.session);
	console.log("Signed in. Waterfall MCP credentials were saved locally.");
}

void main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});

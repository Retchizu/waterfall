import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const MAX_PAYLOAD_BYTES = 1_000_000;
const encoder = new TextEncoder();

function constantTimeEqual(left: string, right: string) {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let index = 0; index < left.length; index += 1) {
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return difference === 0;
}

function hex(bytes: ArrayBuffer) {
	return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isValidSignature(signature: string | null, body: Uint8Array, secret: string) {
	if (!signature?.startsWith("sha256=")) return false;
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const expected = `sha256=${hex(await crypto.subtle.sign("HMAC", key, body))}`;
	return constantTimeEqual(signature, expected);
}

function json(status: number, body: Record<string, string>) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

Deno.serve(async (request) => {
	if (request.method !== "POST") return json(405, { error: "Method not allowed" });

	const secret = Deno.env.get("GITHUB_WEBHOOK_SECRET");
	const supabaseUrl = Deno.env.get("SUPABASE_URL");
	const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (!secret || !supabaseUrl || !serviceRoleKey) {
		console.error("GitHub webhook is missing required server configuration");
		return json(500, { error: "Webhook receiver is not configured" });
	}

	const contentLength = Number(request.headers.get("content-length") ?? 0);
	if (contentLength > MAX_PAYLOAD_BYTES) return json(413, { error: "Payload too large" });
	const rawBody = new Uint8Array(await request.arrayBuffer());
	if (rawBody.byteLength > MAX_PAYLOAD_BYTES) return json(413, { error: "Payload too large" });
	if (!(await isValidSignature(request.headers.get("x-hub-signature-256"), rawBody, secret))) {
		return json(401, { error: "Invalid webhook signature" });
	}

	const deliveryId = request.headers.get("x-github-delivery");
	const eventName = request.headers.get("x-github-event");
	if (!deliveryId || !eventName) return json(400, { error: "Missing GitHub delivery headers" });

	let payload: unknown;
	try {
		payload = JSON.parse(new TextDecoder().decode(rawBody));
	} catch {
		return json(400, { error: "Invalid JSON payload" });
	}

	const supabase = createClient(supabaseUrl, serviceRoleKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	const { data, error } = await supabase.rpc("process_github_webhook", {
		p_github_delivery_id: deliveryId,
		p_event_name: eventName,
		p_payload: payload,
	});
	if (error || !data) {
		console.error("GitHub webhook delivery failed", { deliveryId, eventName, error: error?.message });
		return json(500, { error: "Webhook processing failed" });
	}
	if (data.outcome === "failed") {
		console.error("GitHub webhook delivery failed during processing", { deliveryId, eventName });
		return json(500, { error: "Webhook processing failed" });
	}
	return json(200, { outcome: data.outcome });
});

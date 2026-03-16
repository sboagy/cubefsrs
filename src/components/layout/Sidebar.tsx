import { DbStatusDropdown, useAuth } from "@rhizome/core";
import { A, useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { connectDevice, device, disconnectDevice } from "@/stores/device";

export default function Sidebar() {
	const { user, isAnonymous, signOut } = useAuth();
	const navigate = useNavigate();
	const [showUserMenu, setShowUserMenu] = createSignal(false);
	const [signingOut, setSigningOut] = createSignal(false);

	async function toggleConnect() {
		if (device.connected) await disconnectDevice();
		else await connectDevice();
	}

	async function handleSignOut() {
		setSigningOut(true);
		try {
			await signOut();
			navigate("/login");
		} finally {
			setSigningOut(false);
			setShowUserMenu(false);
		}
	}

	// First letter of email for the avatar badge
	const avatarLetter = () => {
		const u = user();
		if (!u || isAnonymous()) return "?";
		return (u.email?.charAt(0) ?? "?").toUpperCase();
	};

	return (
		<div class="h-full p-4 space-y-4 flex flex-col">
			<div class="flex items-center gap-2">
				<img src="/favicon.svg" alt="" class="w-7 h-7" aria-hidden="true" />
				<span class="text-lg font-semibold">CubeFSRS</span>
			</div>
			<nav class="flex flex-col gap-1 flex-1">
				<A class="btn" href="/" end>
					Practice
				</A>
				<A class="btn" href="/new">
					New Alg
				</A>
				<A class="btn" href="/library">
					Alg Library
				</A>
				<A class="btn" href="/options">
					Options
				</A>
				<A class="btn" href="/help">
					Help
				</A>
				<A class="btn" href="/build">
					Build
				</A>
			</nav>
			<div class="pt-2 border-t border-gray-200 dark:border-gray-800 space-y-2">
				<button
					type="button"
					class="w-full px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
					disabled={device.connecting}
					onClick={toggleConnect}
				>
					{device.connected
						? "Disconnect"
						: device.connecting
							? "Connecting…"
							: "Connect"}
				</button>
				<div class="text-sm text-gray-500">
					Device:{" "}
					<span class={device.connected ? "text-green-600" : "opacity-80"}>
						{device.connected
							? device.info.name || "connected"
							: "not connected"}
					</span>
					{device.info.battery != null && (
						<span> · {device.info.battery}%</span>
					)}
				</div>
			</div>

			{/* User menu — pinned to bottom of sidebar */}
			<div class="flex flex-col gap-0">
				<div class="pt-2 border-t border-gray-200 dark:border-gray-800 relative">
				<Show when={user() || isAnonymous()}>
					{/* Trigger button */}
					<button
						type="button"
						onClick={() => setShowUserMenu(!showUserMenu())}
						class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
						aria-label="User menu"
						aria-expanded={showUserMenu()}
					>
						{/* Avatar badge */}
						<div
							class={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
								isAnonymous()
									? "bg-gradient-to-br from-gray-400 to-gray-600"
									: "bg-gradient-to-br from-blue-500 to-purple-600"
							}`}
						>
							{avatarLetter()}
						</div>
						<span class="flex-1 text-left truncate font-medium">
							{isAnonymous() ? "Device Only" : (user()?.email ?? "Signed in")}
						</span>
						{/* Chevron rotates when open */}
						<svg
							class="w-4 h-4 flex-shrink-0 transition-transform"
							classList={{ "rotate-180": showUserMenu() }}
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 9l-7 7-7-7"
							/>
						</svg>
					</button>

					{/* Dropdown panel — opens upward */}
					<Show when={showUserMenu()}>
						<div class="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
							<div class="py-2">
								{/* Registered user info */}
								<Show when={user() && !isAnonymous()}>
									{(_) => {
										const u = user()!;
										return (
											<div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
												<h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
													User Information
												</h3>
												<dl class="space-y-1.5 text-sm">
													<div class="flex gap-2">
														<dt class="font-medium text-gray-600 dark:text-gray-400">
															Email:
														</dt>
														<dd class="text-gray-900 dark:text-gray-100 break-all">
															{u.email}
														</dd>
													</div>
													<div class="flex gap-2">
														<dt class="font-medium text-gray-600 dark:text-gray-400">
															Name:
														</dt>
														<dd class="text-gray-900 dark:text-gray-100">
															{u.user_metadata?.name || "Not set"}
														</dd>
													</div>
													<div class="flex gap-2">
														<dt class="font-medium text-gray-600 dark:text-gray-400">
															User ID:
														</dt>
														<dd class="text-gray-700 dark:text-gray-300 font-mono text-xs break-all">
															{u.id}
														</dd>
													</div>
												</dl>
											</div>
										);
									}}
								</Show>

								{/* Anonymous user info */}
								<Show when={isAnonymous()}>
									<div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
										<h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
											Device-Only Mode
										</h3>
										<p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
											Data stored locally on this device only.
										</p>
										<button
											type="button"
											onClick={() => {
												setShowUserMenu(false);
												navigate("/login?convert=true");
											}}
											class="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
										>
											Create Account
										</button>
									</div>
								</Show>

								{/* Sign Out */}
								<div class="px-2 pt-2">
									<button
										type="button"
										onClick={handleSignOut}
										disabled={signingOut()}
										class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-60"
									>
										<svg
											class="w-4 h-4"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
											aria-hidden="true"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
											/>
										</svg>
										{signingOut() ? "Signing out..." : "Sign Out"}
									</button>
								</div>
							</div>
						</div>

						{/* Click-outside overlay */}
						<div
							class="fixed inset-0 z-40"
							onClick={() => setShowUserMenu(false)}
							onKeyDown={(e) => {
								if (e.key === "Escape") setShowUserMenu(false);
							}}
							aria-hidden="true"
						/>
					</Show>
					</Show>
				</div>
			</div>
			{/* DB / sync status dropdown — very bottom of sidebar */}
			<div class="pt-2 border-t border-gray-200 dark:border-gray-800">
				<DbStatusDropdown />
			</div>
		</div>
	);
}

import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { auth, setUser } from "@/stores/auth";
import {
  signInWithGoogle,
  signOut,
  subscribeAuth,
  signInWithEmail,
  registerWithEmail,
} from "@/services/firebase";

export default function AuthPanel() {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  let unsub: (() => void) | null = null;

  onMount(() => {
    unsub = subscribeAuth((u) => setUser(u));
  });
  onCleanup(() => {
    unsub?.();
    unsub = null;
  });

  async function doSignInGoogle() {
    await signInWithGoogle();
  }
  async function doSignOut() {
    await signOut();
  }
  async function doEmailLogin(e: SubmitEvent) {
    e.preventDefault();
    if (!email() || !password()) return;
    await signInWithEmail(email(), password());
  }
  async function doEmailRegister() {
    if (!email() || !password()) return;
    await registerWithEmail(email(), password());
  }

  return (
    <div class="space-y-3 text-sm">
      <Show
        when={auth.user}
        fallback={
          <div class="space-y-3">
            <div class="text-gray-500">Offline</div>
            <form class="grid gap-2" onSubmit={doEmailLogin}>
              <input
                class="rounded border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2"
                type="email"
                value={email()}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                placeholder="Email"
              />
              <input
                class="rounded border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2"
                type="password"
                value={password()}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                placeholder="Password"
              />
              <div class="flex gap-2">
                <button type="submit" class="px-3 py-2 rounded bg-blue-600 text-white">
                  Sign in
                </button>
                <button
                  type="button"
                  class="px-3 py-2 rounded border"
                  onClick={doEmailRegister}
                >
                  Register
                </button>
                <button
                  type="button"
                  class="px-3 py-2 rounded bg-gray-200 dark:bg-gray-800"
                  onClick={doSignInGoogle}
                >
                  Google
                </button>
              </div>
            </form>
          </div>
        }
      >
        <div class="text-gray-500">
          Signed in as{" "}
          <span class="font-medium">
            {auth.user?.displayName || auth.user?.email || auth.user?.uid}
          </span>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="px-3 py-2 rounded bg-gray-200 dark:bg-gray-800"
            onClick={doSignOut}
          >
            Sign out
          </button>
        </div>
      </Show>
    </div>
  );
}

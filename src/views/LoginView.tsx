/**
 * LoginView
 *
 * Thin wrapper around the shared LoginPage component from @rhizome/core.
 * Passes CubeFSRS-specific branding (name, logo, tagline) as props.
 */

import { LoginPage } from "@rhizome/core";
import type { Component } from "solid-js";

const LoginView: Component = () => {
	return (
<LoginPage
			appName="CubeFSRS"
			appLogo={<img src="/favicon.svg" alt="CubeFSRS" class="w-16 h-16" aria-hidden="true" />}
			appTagline="Cube algorithm trainer"
			anonDescription="Try CubeFSRS without an account. Your data will only be stored on this device and won't sync to other devices."
			backupDescription="Create an account to save and sync your algorithms across devices"
		/>
	);
};

export default LoginView;

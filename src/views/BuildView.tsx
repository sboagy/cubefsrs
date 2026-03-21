// @ts-ignore – package.json import resolved by Vite
import pkg from "../../package.json";

export default function BuildView() {
	const version = (pkg as { version: string }).version;

	return (
		<div class="space-y-4">
			<h1 class="text-2xl font-semibold">CubeFSRS Build</h1>
			<div class="text-sm text-gray-500">
				Version: <span class="font-medium">{version}</span>
			</div>
			<div class="text-sm">
				<p>Credits:</p>
				<ul class="list-disc pl-5 space-y-1">
					<li>FSRS scheduling</li>
					<li>cubing.js TwistyPlayer</li>
					<li>GAN Web Bluetooth</li>
				</ul>
			</div>
			<div class="text-sm">
				<a
					class="text-blue-600 hover:underline"
					href="https://github.com/sboagy/cubefsrs"
					target="_blank"
					rel="noopener noreferrer"
				>
					Source (legacy)
				</a>
			</div>
		</div>
	);
}

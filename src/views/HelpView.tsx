export default function HelpView() {
	return (
		<div class="space-y-6 max-w-3xl">
			<h1 class="text-2xl font-semibold">Smartcube Help</h1>
			<p class="text-sm opacity-80">
				Connect a GAN smart cube from the sidebar. If your browser can't
				auto-detect the MAC, you'll be prompted to enter it once.
			</p>

			<div class="space-y-2">
				<h2 class="text-lg font-medium">Not using a smart cube?</h2>
				<p class="text-sm opacity-80">
					You can still train with the virtual cube and manual timing. Use the
					Practice page: Train to start/stop the timer, Next/Prev to navigate
					cases.
				</p>
			</div>

			<div class="space-y-2">
				<h2 class="text-lg font-medium">Getting started</h2>
				<ul class="list-disc pl-5 text-sm space-y-1">
					<li>Pick a category and select cases in the Algorithm Library.</li>
					<li>
						In Options, choose Yellow Up or White Up to match your preference.
					</li>
					<li>
						On Practice, use Order to switch between Sequential, Random, and
						FSRS.
					</li>
				</ul>
			</div>

			<div class="space-y-2">
				<h2 class="text-lg font-medium">Tutorial video</h2>
				<div class="aspect-video rounded overflow-hidden bg-black">
					<iframe
						class="w-full h-full"
						src="https://www.youtube.com/embed/dQw4w9WgXcQ"
						title="Tutorial"
						frameborder="0"
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowfullscreen
					/>
				</div>
			</div>

			<div class="space-y-2">
				<h2 class="text-lg font-medium">Support</h2>
				<p class="text-sm">
					If this project helps your training, consider supporting via{" "}
					<a
						class="text-blue-600 hover:underline"
						href="https://ko-fi.com/"
						target="_blank"
						rel="noopener noreferrer"
					>
						Ko&#x2011;fi
					</a>
					.
				</p>
			</div>
		</div>
	);
}

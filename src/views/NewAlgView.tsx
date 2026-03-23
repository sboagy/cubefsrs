import { useNavigate, useSearchParams } from "@solidjs/router";
import { createSignal } from "solid-js";
import SaveActions from "@/components/edit/SaveActions";
import { algs, createCase } from "@/stores/algs";

export default function NewAlgView() {
	const navigate = useNavigate();
	const [params] = useSearchParams();

	const [category, setCategory] = createSignal(
		(params.category as string) || algs.currentCategory || "",
	);
	const [subset, setSubset] = createSignal((params.subset as string) || "");
	const [name, setName] = createSignal((params.name as string) || "");
	const [algStr, setAlgStr] = createSignal((params.alg as string) || "");
	const [status, setStatus] = createSignal("");

	function save() {
		const id = name().trim() || algStr().trim() || String(Date.now());
		if (!category() || !subset() || !id) {
			setStatus("Please fill Category, Subset, and Name/Alg.");
			return;
		}
		createCase(category(), subset(), id, {
			name: name() || id,
			alg: algStr().trim(),
			recognition: "",
			mnemonic: "",
			notes: "",
		});
		setStatus("Saved");
		navigate("/");
	}
	function cancel() {
		navigate("/");
	}

	return (
		<div class="space-y-6 max-w-2xl">
			<h1 class="text-2xl font-semibold">New Algorithm</h1>
			<div class="grid gap-3">
				<label class="grid gap-1">
					<span class="text-sm">Category</span>
					<input
						class="input"
						value={category()}
						onInput={(e) => setCategory((e.target as HTMLInputElement).value)}
					/>
				</label>
				<label class="grid gap-1">
					<span class="text-sm">Subset</span>
					<input
						class="input"
						value={subset()}
						onInput={(e) => setSubset((e.target as HTMLInputElement).value)}
					/>
				</label>
				<label class="grid gap-1">
					<span class="text-sm">Name</span>
					<input
						class="input"
						value={name()}
						onInput={(e) => setName((e.target as HTMLInputElement).value)}
					/>
				</label>
				<label class="grid gap-1">
					<span class="text-sm">Algorithm</span>
					<textarea
						class="input min-h-24"
						value={algStr()}
						onInput={(e) => setAlgStr((e.target as HTMLTextAreaElement).value)}
					/>
				</label>
			</div>
			<SaveActions onSave={save} onCancel={cancel}>
				{status()}
			</SaveActions>
		</div>
	);
}

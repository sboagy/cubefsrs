import { createMemo, type JSX } from "solid-js";
import { practice } from "@/stores/practice";

interface Props {
  onCycleVisibility: () => void;
  onEdit: () => void;
  children?: JSX.Element;
}

export default function AlgorithmRow(props: Props) {
  const visibilityIcon = createMemo(() => {
    switch (practice.visibility) {
      case "full":
        return "👁️";
      case "obscured":
        return "👁";
      case "hidden":
        return "🙈";
    }
  });

  const visibilityTitle = createMemo(() => {
    switch (practice.visibility) {
      case "full":
        return "Fully visible (click to obscure)";
      case "obscured":
        return "Obscured (click to hide)";
      case "hidden":
        return "Hidden (click to show)";
    }
  });

  return (
    <div class="flex items-center justify-center w-full">
      <div class="text-xl font-semibold flex items-center">
        {props.children ?? "Algorithm"}
        <div class="ml-6 flex items-center gap-3">
          <button
            type="button"
            class="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 transition"
            onClick={props.onCycleVisibility}
            aria-label="Change visibility"
            title={visibilityTitle()}
          >
            <span class="text-xl leading-none" aria-hidden="true">
              {visibilityIcon()}
            </span>
          </button>
          <button
            type="button"
            class="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 transition"
            onClick={props.onEdit}
            aria-label="Edit Algorithm"
            title="Edit Algorithm"
          >
            <span class="text-xl leading-none" aria-hidden="true">
              ✎
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useState } from "react";
import type { ImageReference } from "@/lib/imageGeneration";

export function useImageReference(workspaceId: string | null, ownerId: string | null = null, disabled = false) {
  const scope = `${ownerId}:${workspaceId}`;
  const [selection, setSelection] = useState<{ scope: string; reference?: ImageReference; blocked: boolean }>({ scope, blocked: false });
  if (selection.scope !== scope) setSelection({ scope, blocked: false });
  const onSelection = useCallback((reference: ImageReference | undefined, blocked: boolean) => {
    setSelection({ scope, reference, blocked });
  }, [scope]);
  return {
    reference: selection?.scope === scope ? selection.reference : undefined,
    blocked: selection?.scope === scope && selection.blocked,
    scope: `reference:${scope}`,
    fieldProps: { workspaceId, disabled, onSelection },
  };
}

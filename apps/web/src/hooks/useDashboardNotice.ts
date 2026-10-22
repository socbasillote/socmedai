import { useState } from "react";

export function useDashboardNotice() {
  const [notice, setNotice] = useState("");

  function clearNotice() {
    setNotice("");
  }

  return {
    notice,
    setNotice,
    clearNotice,
  };
}

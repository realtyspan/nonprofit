import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";

// Replaces window.confirm() app-wide with a dialog styled in the app's own
// colors, instead of whatever the OS/browser draws for a native confirm().
// Kept promise-based specifically so every call site's existing
// `if (!window.confirm(...)) return;` only had to change to
// `if (!(await confirm(...))) return;` — same shape, no restructuring.
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null); // { message, confirmLabel?, cancelLabel?, danger? }
  const resolverRef = useRef(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog({ message, ...options });
    });
  }, []);

  function settle(result) {
    setDialog(null);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <ConfirmDialog
          {...dialog}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

// Returns an async confirm(message, { confirmLabel, cancelLabel, danger })
// function — resolves true/false, exactly like window.confirm()'s return
// value, just awaited instead of returned synchronously.
export function useConfirm() {
  return useContext(ConfirmContext);
}

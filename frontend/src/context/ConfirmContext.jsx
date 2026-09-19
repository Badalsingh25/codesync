/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
const ConfirmContext = createContext(null);

export const ConfirmProvider = ({ children }) => {
  const [state, setState] = useState(null); // { message, title, danger }
  const resolverRef = useRef(null);

  const confirm = useCallback((message, options = {}) => {
    setState({ message, title: options.title || 'Are you sure?', danger: options.danger !== false });
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handle = (result) => {
    setState(null);
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-5">
            <h3 className="text-[15px] font-semibold text-zinc-100 mb-2">{state.title}</h3>
            <p className="text-[13px] text-zinc-400 leading-relaxed mb-5">{state.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handle(false)}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-[13px] font-medium border-none cursor-pointer hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handle(true)}
                className={`px-3.5 py-1.5 rounded-lg text-white text-[13px] font-semibold border-none cursor-pointer ${state.danger ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}
              >
                {state.danger ? 'Delete' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
};
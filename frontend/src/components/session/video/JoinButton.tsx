interface JoinButtonProps {
  mode: 'call' | 'stream';
  disabled?: boolean;
  onClick: () => void;
}

export function JoinButton({ mode, disabled = false, onClick }: JoinButtonProps) {
  const label = mode === 'stream' ? 'Join Live Stream' : 'Join Video Call';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-amber-300/40 bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </button>
  );
}

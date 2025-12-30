'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  output: string;
  awaitingInput?: boolean;
  inputPrompt?: string;
  onSubmitInput?: (value: string) => void;
  resetCounter?: number;
};

export default function Console({ output, awaitingInput = false, inputPrompt = '', onSubmitInput, resetCounter }: Props) {
  const [value, setValue] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [output]);

  // Focus input when awaiting input
  useEffect(() => {
    if (awaitingInput) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      // Clear input when we exit input mode (e.g., after submit or cancellation)
      setValue('');
    }
  }, [awaitingInput]);

  // Clear input when a new run starts (resetCounter changes)
  useEffect(() => {
    setValue('');
  }, [resetCounter]);

  const submit = () => {
    if (!onSubmitInput) return;
    const v = value;
    setValue('');
    onSubmitInput(v);
  };

  return (
    <div className="bg-black text-white font-mono p-2 rounded max-h-48 overflow-y-auto text-sm" ref={containerRef}>
      {output
        ? output.split(/\n/).map((line, i) => (
            <div key={i}>{line}</div>
          ))
        : null}

      {onSubmitInput && (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-green-400 select-none">{awaitingInput ? (inputPrompt || '>') : ''}</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none border-none text-white placeholder-gray-500"
            placeholder={awaitingInput ? 'Tapez votre réponse puis Entrée' : ''}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                submit();
              }
            }}
            disabled={!awaitingInput}
          />
        </div>
      )}
    </div>
  );
}

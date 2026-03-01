import { useCallback, useEffect, useState } from "react";
import { NativeSyntheticEvent, TextInputSelectionChangeEventData } from "react-native";

export type TextSelection = {
  start: number;
  end: number;
};

export type TextEditingAction =
  | "history_prev"
  | "history_next"
  | "cursor_left"
  | "cursor_right"
  | "cursor_home"
  | "cursor_end"
  | "word_back"
  | "word_forward"
  | "delete_word_back";

type UseTextEditingArgs = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onHistoryPrev?: () => void;
  onHistoryNext?: () => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampSelection(selection: TextSelection, textLength: number): TextSelection {
  const start = clamp(selection.start, 0, textLength);
  const end = clamp(selection.end, start, textLength);
  return { start, end };
}

function wordStart(text: string, index: number): number {
  let pointer = clamp(index, 0, text.length);
  while (pointer > 0 && /\s/.test(text[pointer - 1])) {
    pointer -= 1;
  }
  while (pointer > 0 && !/\s/.test(text[pointer - 1])) {
    pointer -= 1;
  }
  return pointer;
}

function wordEnd(text: string, index: number): number {
  let pointer = clamp(index, 0, text.length);
  while (pointer < text.length && /\s/.test(text[pointer])) {
    pointer += 1;
  }
  while (pointer < text.length && !/\s/.test(text[pointer])) {
    pointer += 1;
  }
  return pointer;
}

export function useTextEditing({
  value,
  onChange,
  disabled = false,
  onHistoryPrev,
  onHistoryNext,
}: UseTextEditingArgs) {
  const [selection, setSelection] = useState<TextSelection>({
    start: value.length,
    end: value.length,
  });

  useEffect(() => {
    setSelection((current) => {
      const next = clampSelection(current, value.length);
      if (next.start === current.start && next.end === current.end) {
        return current;
      }
      return next;
    });
  }, [value]);

  const applyValueWithCursor = useCallback(
    (nextValue: string, cursor: number) => {
      onChange(nextValue);
      const boundedCursor = clamp(cursor, 0, nextValue.length);
      setSelection({ start: boundedCursor, end: boundedCursor });
    },
    [onChange]
  );

  const insertTextAtCursor = useCallback(
    (text: string) => {
      if (disabled) {
        return;
      }
      const range = clampSelection(selection, value.length);
      const nextValue = `${value.slice(0, range.start)}${text}${value.slice(range.end)}`;
      applyValueWithCursor(nextValue, range.start + text.length);
    },
    [applyValueWithCursor, disabled, selection, value]
  );

  const handleAction = useCallback(
    (action: TextEditingAction) => {
      if (action === "history_prev") {
        if (!disabled) {
          onHistoryPrev?.();
        }
        return;
      }
      if (action === "history_next") {
        if (!disabled) {
          onHistoryNext?.();
        }
        return;
      }

      if (disabled) {
        return;
      }

      const range = clampSelection(selection, value.length);
      if (action === "cursor_left") {
        const cursor = range.start === range.end ? range.start - 1 : range.start;
        const bounded = clamp(cursor, 0, value.length);
        setSelection({ start: bounded, end: bounded });
        return;
      }
      if (action === "cursor_right") {
        const cursor = range.start === range.end ? range.end + 1 : range.end;
        const bounded = clamp(cursor, 0, value.length);
        setSelection({ start: bounded, end: bounded });
        return;
      }
      if (action === "cursor_home") {
        setSelection({ start: 0, end: 0 });
        return;
      }
      if (action === "cursor_end") {
        const cursor = value.length;
        setSelection({ start: cursor, end: cursor });
        return;
      }
      if (action === "word_back") {
        const cursor = wordStart(value, range.start);
        setSelection({ start: cursor, end: cursor });
        return;
      }
      if (action === "word_forward") {
        const cursor = wordEnd(value, range.end);
        setSelection({ start: cursor, end: cursor });
        return;
      }
      if (action === "delete_word_back") {
        if (range.start !== range.end) {
          const nextValue = `${value.slice(0, range.start)}${value.slice(range.end)}`;
          applyValueWithCursor(nextValue, range.start);
          return;
        }
        const left = wordStart(value, range.start);
        if (left === range.start) {
          return;
        }
        const nextValue = `${value.slice(0, left)}${value.slice(range.end)}`;
        applyValueWithCursor(nextValue, left);
      }
    },
    [applyValueWithCursor, disabled, onHistoryNext, onHistoryPrev, selection, value]
  );

  const onSelectionChange = useCallback((event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    setSelection(event.nativeEvent.selection);
  }, []);

  return {
    selection,
    setSelection,
    onSelectionChange,
    insertTextAtCursor,
    handleAction,
  };
}

import Anser from "anser";
import React from "react";
import { StyleProp, Text, TextStyle } from "react-native";

type AnsiSpan = {
  content: string;
  fg: string | null;
  bg: string | null;
  decoration: string | null;
  was_processed: boolean;
};

type AnsiTextProps = {
  text: string;
  style?: StyleProp<TextStyle>;
  searchTerm?: string;
  activeMatchIndex?: number;
};

export function AnsiText({ text, style, searchTerm, activeMatchIndex }: AnsiTextProps) {
  const parsed = Anser.ansiToJson(text, { use_classes: false }) as unknown as AnsiSpan[];
  const normalizedSearch = searchTerm?.trim().toLowerCase() || "";
  const escapedSearch = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let matchCursor = 0;

  return (
    <Text style={style}>
      {parsed.map((span, index) => {
        const isBold = span.decoration?.includes("bold") ?? false;
        const isItalic = span.decoration?.includes("italic") ?? false;
        const isUnderline = span.decoration?.includes("underline") ?? false;
        const content = span.content || "";

        const pieces =
          normalizedSearch && content
            ? content.split(new RegExp(`(${escapedSearch})`, "ig"))
            : [content];

        return (
          <Text
            key={index}
            style={{
              color: span.fg || undefined,
              backgroundColor: span.bg || undefined,
              fontWeight: isBold ? "bold" : "normal",
              fontStyle: isItalic ? "italic" : "normal",
              textDecorationLine: isUnderline ? "underline" : "none",
            }}
          >
            {pieces.map((piece, pieceIndex) => {
              const matches =
                normalizedSearch.length > 0 && piece.toLowerCase() === normalizedSearch;
              if (!matches) {
                return piece;
              }
              const isActive = activeMatchIndex !== undefined && matchCursor === activeMatchIndex;
              matchCursor += 1;
              return (
                <Text
                  key={`${index}-${pieceIndex}`}
                  style={{
                    backgroundColor: isActive ? "rgba(255, 235, 120, 0.82)" : "rgba(255, 200, 87, 0.45)",
                    color: isActive ? "#1b1100" : undefined,
                  }}
                >
                  {piece}
                </Text>
              );
            })}
          </Text>
        );
      })}
    </Text>
  );
}

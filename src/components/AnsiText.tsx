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
};

export function AnsiText({ text, style }: AnsiTextProps) {
  const parsed = Anser.ansiToJson(text, { use_classes: false }) as unknown as AnsiSpan[];

  return (
    <Text style={style}>
      {parsed.map((span, index) => {
        const isBold = span.decoration?.includes("bold") ?? false;
        const isItalic = span.decoration?.includes("italic") ?? false;
        const isUnderline = span.decoration?.includes("underline") ?? false;

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
            {span.content}
          </Text>
        );
      })}
    </Text>
  );
}

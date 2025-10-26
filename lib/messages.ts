import type { MessageItem } from "./session-types";

export const getMessageCopy = (item: MessageItem) => {
  const transcript = item.content
    .map((content) => {
      switch (content.type) {
        case "input_text":
        case "output_text":
          return content.text;
        case "input_audio":
        case "output_audio":
          return content.transcript ?? "";
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!transcript) {
    return `(${item.role} event)`;
  }

  return transcript;
};

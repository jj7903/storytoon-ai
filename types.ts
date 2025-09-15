export type AspectRatio = "16:9" | "9:16";

export interface CharacterData {
  file: File;
  preview: string;
}

export interface PanelData {
  story: string;
  image: string | null;
  characters: CharacterData[];
  isRegenerating?: boolean;
}

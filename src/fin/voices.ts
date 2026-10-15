/** FIN voice options. All are Gemini Live prebuilt voices verified against our live model. */
export interface FinVoice {
  id: string;
  label: string;
  gender: 'female' | 'male';
  style: string;
}

export const FIN_VOICES: FinVoice[] = [
  { id: 'Aoede', label: 'Aoede', gender: 'female', style: 'warm & breezy' },
  { id: 'Kore', label: 'Kore', gender: 'female', style: 'clear & confident' },
  { id: 'Leda', label: 'Leda', gender: 'female', style: 'youthful & friendly' },
  { id: 'Zephyr', label: 'Zephyr', gender: 'female', style: 'bright & energetic' },
  { id: 'Puck', label: 'Puck', gender: 'male', style: 'upbeat & witty' },
  { id: 'Charon', label: 'Charon', gender: 'male', style: 'calm & informative' },
];

export const DEFAULT_FIN_VOICE = 'Puck';

export function finVoice(id: string | undefined): FinVoice {
  return FIN_VOICES.find((v) => v.id === id) ?? FIN_VOICES.find((v) => v.id === DEFAULT_FIN_VOICE)!;
}

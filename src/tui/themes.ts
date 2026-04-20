export type ThemeName = 'default' | 'midnight' | 'ocean' | 'solarized' | 'warm'
  | 'violet-storm' | 'cosmic' | 'nord' | 'ember' | 'sakura' | 'obsidian-gold' | 'crimson';

export interface ColorSet {
  brand: string; accent: string; error: string;
  textPrimary: string; textSecondary: string; textMuted: string; textDim: string; textFaint: string;
  borderActive: string; borderAccent: string; borderIdle: string; borderSubtle: string; borderAssist: string;
  logoA: string; logoB: string;
}

export const THEMES: Record<ThemeName, ColorSet> = {
  default: {
    brand: '#22C55E', accent: '#F59E0B', error: '#EF4444',
    textPrimary: '#E5E7EB', textSecondary: '#9CA3AF', textMuted: '#6B7280', textDim: '#4B5563', textFaint: '#374151',
    borderActive: '#22C55E', borderAccent: '#F59E0B', borderIdle: '#1F2937', borderSubtle: '#1F2937', borderAssist: '#374151',
    logoA: '#22C55E', logoB: '#60A5FA',
  },
  midnight: {
    brand: '#8B5CF6', accent: '#F59E0B', error: '#EF4444',
    textPrimary: '#E2E8F0', textSecondary: '#94A3B8', textMuted: '#64748B', textDim: '#334155', textFaint: '#1E293B',
    borderActive: '#8B5CF6', borderAccent: '#F59E0B', borderIdle: '#1E293B', borderSubtle: '#1E293B', borderAssist: '#2D3748',
    logoA: '#8B5CF6', logoB: '#60A5FA',
  },
  ocean: {
    brand: '#06B6D4', accent: '#F59E0B', error: '#EF4444',
    textPrimary: '#ECFEFF', textSecondary: '#67E8F9', textMuted: '#22D3EE', textDim: '#0E7490', textFaint: '#164E63',
    borderActive: '#06B6D4', borderAccent: '#F59E0B', borderIdle: '#164E63', borderSubtle: '#164E63', borderAssist: '#0E7490',
    logoA: '#06B6D4', logoB: '#7DD3FC',
  },
  solarized: {
    brand: '#859900', accent: '#CB4B16', error: '#DC322F',
    textPrimary: '#EEE8D5', textSecondary: '#839496', textMuted: '#657B83', textDim: '#586E75', textFaint: '#073642',
    borderActive: '#859900', borderAccent: '#CB4B16', borderIdle: '#073642', borderSubtle: '#073642', borderAssist: '#002B36',
    logoA: '#268BD2', logoB: '#859900',
  },
  warm: {
    brand: '#F59E0B', accent: '#EF4444', error: '#DC2626',
    textPrimary: '#FEF3C7', textSecondary: '#FDE68A', textMuted: '#D97706', textDim: '#92400E', textFaint: '#451A03',
    borderActive: '#F59E0B', borderAccent: '#EF4444', borderIdle: '#1C0A00', borderSubtle: '#1C0A00', borderAssist: '#451A03',
    logoA: '#F59E0B', logoB: '#EF4444',
  },
  'violet-storm': {
    brand: '#8B5CF6', accent: '#A78BFA', error: '#EF4444',
    textPrimary: '#EDE9FE', textSecondary: '#C4B5FD', textMuted: '#A78BFA', textDim: '#7C3AED', textFaint: '#1E1B4B',
    borderActive: '#8B5CF6', borderAccent: '#A78BFA', borderIdle: '#1E1B4B', borderSubtle: '#1E1B4B', borderAssist: '#312E81',
    logoA: '#8B5CF6', logoB: '#A78BFA',
  },
  cosmic: {
    brand: '#FF006E', accent: '#FB5607', error: '#EF4444',
    textPrimary: '#FFFFFF', textSecondary: '#FB5607', textMuted: '#FFBE0B', textDim: '#8338EC', textFaint: '#1A1A1A',
    borderActive: '#FF006E', borderAccent: '#FB5607', borderIdle: '#1A1A1A', borderSubtle: '#1A1A1A', borderAssist: '#333333',
    logoA: '#FF006E', logoB: '#FB5607',
  },
  nord: {
    brand: '#88C0D0', accent: '#81A1C1', error: '#BF616A',
    textPrimary: '#ECEFF4', textSecondary: '#D8DEE9', textMuted: '#4C566A', textDim: '#3B4252', textFaint: '#2E3440',
    borderActive: '#88C0D0', borderAccent: '#81A1C1', borderIdle: '#2E3440', borderSubtle: '#2E3440', borderAssist: '#434C5E',
    logoA: '#88C0D0', logoB: '#81A1C1',
  },
  ember: {
    brand: '#FF4500', accent: '#FFD700', error: '#DC2626',
    textPrimary: '#FFF176', textSecondary: '#FFB300', textMuted: '#FF8C00', textDim: '#FF6A00', textFaint: '#1A0F00',
    borderActive: '#FF4500', borderAccent: '#FFD700', borderIdle: '#1A0F00', borderSubtle: '#1A0F00', borderAssist: '#331D00',
    logoA: '#FF4500', logoB: '#FFD700',
  },
  sakura: {
    brand: '#C4306A', accent: '#FF85A1', error: '#EF4444',
    textPrimary: '#FFF0F3', textSecondary: '#FFB7C5', textMuted: '#FF5C8D', textDim: '#E0457B', textFaint: '#3D0012',
    borderActive: '#C4306A', borderAccent: '#FF85A1', borderIdle: '#1F000A', borderSubtle: '#1F000A', borderAssist: '#3D0012',
    logoA: '#C4306A', logoB: '#FF85A1',
  },
  'obsidian-gold': {
    brand: '#C47C0A', accent: '#F5C518', error: '#EF4444',
    textPrimary: '#FFF8E7', textSecondary: '#F5C518', textMuted: '#E8A015', textDim: '#D4890A', textFaint: '#332100',
    borderActive: '#C47C0A', borderAccent: '#F5C518', borderIdle: '#1A1100', borderSubtle: '#1A1100', borderAssist: '#332100',
    logoA: '#C47C0A', logoB: '#F5C518',
  },
  crimson: {
    brand: '#C10023', accent: '#FF2952', error: '#DC143C',
    textPrimary: '#FFB3C1', textSecondary: '#FF6B8A', textMuted: '#FF2952', textDim: '#DC143C', textFaint: '#33000A',
    borderActive: '#C10023', borderAccent: '#FF2952', borderIdle: '#1A0005', borderSubtle: '#1A0005', borderAssist: '#33000A',
    logoA: '#C10023', logoB: '#FF2952',
  },
};

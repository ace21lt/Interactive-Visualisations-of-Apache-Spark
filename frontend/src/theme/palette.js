export const brandPurple = '#440099';
export const brandPurpleDark = '#190041';
export const brandPurpleTint = '#f0e6ff';
export const brandYellow = '#FFCF00';

export const neutralWhite = '#ffffff';
export const neutralSurface = '#fafafa';
export const neutralSurfaceAlt = '#f4f4f4';
export const neutralBorder = '#e8e8e8';
export const neutralDivider = '#d0d0d0';
export const neutralText = '#1a1a1a';
export const neutralMuted = '#666666';
export const neutralSubtle = '#888888';

export const successBg = '#e8f5e9';
export const successFg = '#1b5e20';
export const warningBg = '#fff8e1';
export const warningFg = '#7c3a00';
export const errorBg = '#ffebee';
export const errorFg = '#b71c1c';

export const chartBlue = '#0072B2';
export const chartOrange = '#E69F00';
export const chartGreen = '#009E73';
export const chartPurple = '#CC79A7';
export const chartRed = '#D55E00';
export const chartSky = '#56B4E9';

export const chartBlueTint = '#e6f1fb';
export const chartOrangeTint = '#fff3e0';
export const chartGreenTint = '#f0fdf4';
export const chartPurpleTint = '#fce4ec';
export const chartRedTint = '#fff0f0';

export const okabeIto = {
  blue: chartBlue,
  orange: chartOrange,
  green: chartGreen,
  purple: chartPurple,
  red: chartRed,
  sky: chartSky,
};

const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return null;
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) return null;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

export const alpha = (hex, opacity) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
};


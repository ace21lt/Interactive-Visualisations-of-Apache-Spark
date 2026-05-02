export const brandPurple = '#440099';
export const brandPurpleDark = '#190041';
export const brandPurpleTint = '#f0e6ff';

export const neutralWhite = '#ffffff';
export const neutralSurface = '#fafafa';
export const neutralBorder = '#e8e8e8';
export const neutralMuted = '#666666';

export const successBg = '#e8f5e9';
export const errorFg = '#b71c1c';
export const successFg = '#1b5e20';


export const chartBlue = '#0072B2';
export const chartOrange = '#E69F00';
export const chartGreen = '#009E73';
export const chartPurple = '#CC79A7';
export const chartRed = '#E34234';
export const chartSky = '#56B4E9';

export const chartBlueTint = '#e6f1fb';
export const chartPurpleTint = '#fce4ec';

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


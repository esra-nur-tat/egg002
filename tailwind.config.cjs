// web/app.html tasarim token'lari (dijital_ki_ilik_ar_ivi_my_eras.html'den). Derleme: npm run build:css
module.exports = {
  content: ["./web/app.html"],
  theme: {
    extend: {
      colors: {
        "primary-fixed": "#ffd8e6", "primary-fixed-dim": "#ffafd2", "on-error-container": "#93000a",
        "inverse-primary": "#ffafd2", "on-secondary-fixed": "#221534", primary: "#9a3c6d",
        "secondary-fixed": "#eddcff", "error-container": "#ffdad6", "surface-tint": "#9a3c6d",
        "surface-dim": "#dfd9d1", "on-tertiary-container": "#183c32", "surface-container-lowest": "#ffffff",
        "on-primary": "#ffffff", "surface-variant": "#e8e1da", "on-background": "#1e1b17",
        "inverse-on-surface": "#f7f0e8", surface: "#fff8f1", "on-secondary-fixed-variant": "#4e4062",
        "tertiary-fixed": "#c3ebdb", "on-error": "#ffffff", error: "#ba1a1a", outline: "#867279",
        "surface-container-highest": "#e8e1da", secondary: "#67587b", "primary-container": "#e87cb0",
        background: "#fff8f1", "surface-container-low": "#f9f3eb", "on-primary-fixed-variant": "#7d2455",
        "outline-variant": "#d8c0c8", "tertiary-container": "#81a799", "on-surface-variant": "#534249",
        "secondary-fixed-dim": "#d1bfe8", "surface-container": "#f4ede5", "on-primary-fixed": "#3d0025",
        "surface-bright": "#fff8f1", "secondary-container": "#e8d5ff", "tertiary-fixed-dim": "#a8cfc0",
        "on-tertiary": "#ffffff", tertiary: "#416559", "on-surface": "#1e1b17", "on-tertiary-fixed": "#002118",
        "inverse-surface": "#33302b", "on-primary-container": "#671144", "on-secondary": "#ffffff",
        "on-secondary-container": "#695a7e", "on-tertiary-fixed-variant": "#294d42", "surface-container-high": "#eee7df",
      },
      // piksel avatar icin 2 kareli "nefes" animasyonu
      keyframes: { bob: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-3px)" } } },
      animation: { bob: "bob 1.4s steps(2, jump-none) infinite" },
      borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem", full: "9999px" },
      spacing: {
        "space-sm": "0.5rem", "space-lg": "1rem", gutter: "0.75rem", "margin-desktop": "2rem", "space-xl": "1.5rem",
        "space-md": "0.75rem", margin: "1rem", "gutter-desktop": "1rem", "space-xs": "0.25rem",
      },
      fontFamily: {
        "title-md": ["DM Sans", "sans-serif"], "label-sm": ["Space Mono", "monospace"], "label-md": ["Space Mono", "monospace"],
        "headline-lg": ["Space Mono", "monospace"], "body-sm": ["DM Sans", "sans-serif"], "label-lg": ["Space Mono", "monospace"],
        "headline-md": ["Space Mono", "monospace"], "body-md": ["DM Sans", "sans-serif"], "headline-sm": ["Space Mono", "monospace"],
        "headline-lg-mobile": ["Space Mono", "monospace"], "body-lg": ["DM Sans", "sans-serif"],
      },
    },
  },
};

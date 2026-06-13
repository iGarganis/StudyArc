import type { Metadata } from "next";
import { IBM_Plex_Sans, Manrope } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const plex = IBM_Plex_Sans({
  subsets: ["latin", "greek"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

// Manrope has no Greek glyphs — used only for Latin display bits (wordmark,
// "PDF", "Quiz"). Greek headings fall back to IBM Plex Sans automatically.
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "StudyBox — Από PDF σε υλικό μελέτης",
  description:
    "Ανέβασε τις σημειώσεις της διάλεξης (PDF) και πάρε σύνοψη, απλή εξήγηση και quiz στα ελληνικά.",
};

// Set the saved theme before paint to avoid a flash of the wrong palette.
const themeInit = `(function(){try{var t=localStorage.getItem("studybox:theme");if(t)document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="el"
      className={`${plex.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

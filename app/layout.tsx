import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

// The Greek subset stays: generated material follows the document's language.
const inter = Inter({
  subsets: ["latin", "greek"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "StudyArc — From PDF to study material",
  description:
    "Upload a lecture PDF and create a summary, simple explanation, quiz, true/false set and flashcards in the language of your document.",
};

// Apply the saved (or system) theme before the first paint.
const themeScript = `try{var t=localStorage.getItem("studybox:theme");if(t!=="dark"&&t!=="light")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={inter.variable}
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}

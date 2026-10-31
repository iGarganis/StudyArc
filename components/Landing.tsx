const FEATURES = [
  { name: "Summary", text: "Key points and formulas, organized." },
  { name: "Simple explanation", text: "The material in plain language." },
  { name: "Quiz", text: "20 multiple-choice questions with explanations." },
  { name: "True / False", text: "20 statements with explanations." },
  { name: "Flashcards", text: "20 cards, with repeat rounds for the ones you missed." },
];

export function LandingIntro() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-[-0.02em]">
        Study material from your lectures
      </h1>
      <p className="text-base leading-6 text-muted-foreground">
        Upload a lecture PDF and create a Summary, Simple explanation, Quiz,
        True / False and Flashcards, in the language of your document.
      </p>
    </div>
  );
}

export function LandingFeatures() {
  return (
    <section className="flex flex-col gap-1 sm:gap-2">
      <h2 className="text-base leading-6 font-semibold">What you get</h2>
      <div className="flex flex-col">
        {FEATURES.map((f) => (
          <div
            key={f.name}
            className="flex flex-col gap-0.5 border-b py-2.5 sm:grid sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4 sm:py-3"
          >
            <span className="font-medium">{f.name}</span>
            <span className="text-muted-foreground">{f.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

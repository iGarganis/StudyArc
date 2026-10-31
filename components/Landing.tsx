const FEATURES = [
  { name: "Σύνοψη", text: "Οργανωμένα βασικά σημεία και τύποι." },
  { name: "Απλή εξήγηση", text: "Η ύλη με απλά λόγια." },
  { name: "Quiz", text: "20 ερωτήσεις πολλαπλής επιλογής με εξήγηση." },
  { name: "Σωστό / Λάθος", text: "20 δηλώσεις με εξήγηση." },
  { name: "Κάρτες", text: "20 κάρτες με επανάληψη όσων δεν γνωρίζατε." },
];

export function LandingIntro() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-[-0.02em]">
        Υλικό μελέτης από τις διαλέξεις σας
      </h1>
      <p className="text-base leading-6 text-muted-foreground">
        Ανεβάστε ένα PDF διάλεξης και δημιουργήστε Σύνοψη, Απλή εξήγηση, Quiz,
        Σωστό / Λάθος και Κάρτες στα ελληνικά.
      </p>
    </div>
  );
}

export function LandingFeatures() {
  return (
    <section className="flex flex-col gap-1 sm:gap-2">
      <h2 className="text-base leading-6 font-semibold">Τι θα λάβετε</h2>
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

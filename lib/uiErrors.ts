import { humanSize } from "@/lib/study";

export type UiError = { title: string; description: string };

export const NOT_PDF_ERROR: UiError = {
  title: "Το αρχείο δεν είναι PDF",
  description: "Επιλέξτε ένα αρχείο PDF. Άλλοι τύποι αρχείων δεν υποστηρίζονται.",
};

const GENERIC_ERROR: UiError = {
  title: "Η δημιουργία υλικού απέτυχε",
  description: "Παρουσιάστηκε σφάλμα κατά τη δημιουργία. Δοκιμάστε ξανά σε λίγο.",
};

const NO_TEXT_ERROR: UiError = {
  title: "Το PDF δεν έχει επιλέξιμο κείμενο",
  description:
    "Το αρχείο φαίνεται σαρωμένο, οπότε δεν μπορεί να διαβαστεί. Χρησιμοποιήστε ένα PDF με επιλέξιμο κείμενο ή περάστε το πρώτα από αναγνώριση κειμένου (OCR).",
};

const OVERLOADED_ERROR: UiError = {
  title: "Το μοντέλο είναι προσωρινά υπερφορτωμένο",
  description:
    "Η υπηρεσία δέχεται πολλά αιτήματα αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγα λεπτά.",
};

/**
 * Turn an /api/generate failure into the UI's title + text. The server's Greek
 * `error` string stays the source for the one case its code can't distinguish:
 * PROVIDER_ERROR covers both an overloaded model and any other provider failure.
 */
export function errorFromApi(
  code: string | undefined,
  serverMessage: string | undefined,
  fileSize: number,
): UiError {
  switch (code) {
    case "EMPTY_FILE":
      return {
        title: "Το αρχείο είναι κενό",
        description: "Το αρχείο δεν έχει περιεχόμενο. Ελέγξτε το και δοκιμάστε ξανά.",
      };
    case "TOO_LARGE":
      return {
        title: "Το αρχείο ξεπερνά τα 20 MB",
        description: `Το αρχείο είναι ${humanSize(fileSize)}. Συμπιέστε το ή χωρίστε τη διάλεξη σε μικρότερα αρχεία.`,
      };
    case "CORRUPT_PDF":
      return {
        title: "Δεν ήταν δυνατό να ανοίξει το PDF",
        description:
          "Το αρχείο είναι κατεστραμμένο ή προστατεύεται με κωδικό. Αφαιρέστε την προστασία ή αποθηκεύστε το ξανά ως PDF και ανεβάστε το.",
      };
    case "NO_TEXT":
    case "EMPTY_DOCUMENT":
      return NO_TEXT_ERROR;
    case "RATE_LIMITED":
      return {
        title: "Πολλά αιτήματα σε σύντομο χρόνο",
        description:
          "Συμπληρώθηκε το όριο αιτημάτων ανά λεπτό. Δοκιμάστε ξανά σε περίπου ένα λεπτό.",
      };
    case "QUOTA_EXHAUSTED":
      return {
        title: "Εξαντλήθηκε το ημερήσιο όριο",
        description:
          "Χρησιμοποιήθηκαν όλα τα αιτήματα ή τα tokens της ημέρας. Το όριο μηδενίζει αύριο.",
      };
    case "INVALID_RESPONSE":
      return {
        title: "Η απάντηση του μοντέλου δεν ήταν έγκυρη",
        description: "Το υλικό δεν δημιουργήθηκε σωστά. Δοκιμάστε ξανά τη δημιουργία.",
      };
    case "MISSING_API_KEY":
      return {
        title: "Πρόβλημα με το κλειδί API",
        description:
          "Το κλειδί του Gemini λείπει ή δεν είναι έγκυρο. Ελέγξτε τη ρύθμιση GEMINI_API_KEY στον server.",
      };
    case "PROVIDER_ERROR":
      return serverMessage?.includes("υπερφορτωμένο")
        ? OVERLOADED_ERROR
        : GENERIC_ERROR;
    default:
      return GENERIC_ERROR;
  }
}

export { GENERIC_ERROR };

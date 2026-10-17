// TEMPORARY STUB, replaced at integration
import type { ViewModule } from "../types";
const ph = (id: string) => () => '<section class="stack" aria-labelledby="h-' + id + '"><h2 id="h-' + id + '">השאלון</h2><p class="muted">בקרוב.</p></section>';
export const quizModule: ViewModule = { views: { home: ph("home"), quiz: ph("quiz"), results: ph("results") } };

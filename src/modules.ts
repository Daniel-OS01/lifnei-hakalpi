import type { ViewModule } from "./types";
import { quizModule } from "./quiz";
import { coalitionModule } from "./coalition";
import { shellModule } from "./views/shell";

export const modules: ViewModule[] = [quizModule, coalitionModule, shellModule];

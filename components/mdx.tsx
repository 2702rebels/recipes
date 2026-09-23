import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import { Callout } from "@/components/callout";
import { Procedure, ProcedureIndex, ProcedureLinks } from "@/components/procedure";
import { PrintProcedures } from "@/components/procedure-print";
import { BracketingSimulator } from "@/components/interactive/bracketing-simulator";
import { ExpoExplorer } from "@/components/interactive/expo-explorer";
import { GravityCalculator } from "@/components/interactive/gravity-calculator";
import { MotorCurves } from "@/components/interactive/motor-curves";
import { TuningSandbox } from "@/components/interactive/tuning-sandbox";

/** Components available in every MDX page without an import. */
export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Callout,
    PrintProcedures,
    Procedure,
    ProcedureIndex,
    ProcedureLinks,
    BracketingSimulator,
    ExpoExplorer,
    GravityCalculator,
    MotorCurves,
    TuningSandbox,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}

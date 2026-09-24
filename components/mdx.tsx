import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import { Callout } from "@/components/callout";
import { FactorGraphDiagram } from "@/components/diagrams/localization";
import {
  AprilTagAnatomy,
  FrameChain,
  PinholeDiagram,
  RelativeGlobalDiagram,
  ShutterTimeline,
} from "@/components/diagrams/vision";
import { Procedure, ProcedureIndex, ProcedureLinks } from "@/components/procedure";
import { PrintProcedures } from "@/components/procedure-print";
import { BracketingSimulator } from "@/components/interactive/bracketing-simulator";
import { CalibrationError } from "@/components/interactive/calibration-error";
import { DistortionGrid } from "@/components/interactive/distortion-grid";
import { EstimatorGain } from "@/components/interactive/estimator-gain";
import { ExpoExplorer } from "@/components/interactive/expo-explorer";
import { FactorGraphSmoother } from "@/components/interactive/factor-graph-smoother";
import { GravityCalculator } from "@/components/interactive/gravity-calculator";
import { KalmanFilter1D } from "@/components/interactive/kalman-filter";
import { MotorCurves } from "@/components/interactive/motor-curves";
import { OdometryDrift } from "@/components/interactive/odometry-drift";
import { OdometryIntegration } from "@/components/interactive/odometry-integration";
import { PinholeExplorer } from "@/components/interactive/pinhole-explorer";
import { PoseScatter } from "@/components/interactive/pose-scatter";
import { RelativeVsGlobal } from "@/components/interactive/relative-global";
import { RollingShutter } from "@/components/interactive/rolling-shutter";
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
    AprilTagAnatomy,
    FactorGraphDiagram,
    FrameChain,
    PinholeDiagram,
    RelativeGlobalDiagram,
    ShutterTimeline,
    BracketingSimulator,
    CalibrationError,
    DistortionGrid,
    EstimatorGain,
    ExpoExplorer,
    FactorGraphSmoother,
    GravityCalculator,
    KalmanFilter1D,
    MotorCurves,
    OdometryDrift,
    OdometryIntegration,
    PinholeExplorer,
    PoseScatter,
    RelativeVsGlobal,
    RollingShutter,
    TuningSandbox,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}

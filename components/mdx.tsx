import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import type { ComponentType } from "react";

import { Callout } from "@/components/callout";
import { FactorGraphDiagram } from "@/components/diagrams/localization";
import { MechanismTypes } from "@/components/diagrams/mechanisms";
import { RobotLayouts } from "@/components/diagrams/robot-layouts";
import { DrivetrainComparison } from "@/components/diagrams/swerve";
import { DrivetrainLayout, MK3Drawing } from "@/components/diagrams/swerve-layout";
import {
  AprilTagAnatomy,
  FrameChain,
  PinholeDiagram,
  RelativeGlobalDiagram,
  ShutterTimeline,
} from "@/components/diagrams/vision";
import { Procedure, ProcedureIndex, ProcedureLinks } from "@/components/procedure";
import { PrintProcedures } from "@/components/procedure-print";
import { Resettable } from "@/components/interactive/controls";
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
import { SuperstructureMoves } from "@/components/interactive/superstructure-moves";
import { SwerveGearing } from "@/components/interactive/swerve-gearing";
import { SwerveKinematics } from "@/components/interactive/swerve-kinematics";
import { SwerveSkew } from "@/components/interactive/swerve-skew";
import { TuningSandbox } from "@/components/interactive/tuning-sandbox";

/** Wraps a widget so the reset button in its header can restore the defaults. */
const resettable = <P extends object>(Widget: ComponentType<P>) => {
  const Wrapped = (props: P) => (
    <Resettable>
      <Widget {...props} />
    </Resettable>
  );
  Wrapped.displayName = `Resettable(${Widget.displayName ?? Widget.name})`;
  return Wrapped;
};

/** Interactive widgets. Each gets a reset button through {@link resettable}. */
const widgets = {
  BracketingSimulator: resettable(BracketingSimulator),
  CalibrationError: resettable(CalibrationError),
  DistortionGrid: resettable(DistortionGrid),
  EstimatorGain: resettable(EstimatorGain),
  ExpoExplorer: resettable(ExpoExplorer),
  FactorGraphSmoother: resettable(FactorGraphSmoother),
  GravityCalculator: resettable(GravityCalculator),
  KalmanFilter1D: resettable(KalmanFilter1D),
  MotorCurves: resettable(MotorCurves),
  OdometryDrift: resettable(OdometryDrift),
  OdometryIntegration: resettable(OdometryIntegration),
  PinholeExplorer: resettable(PinholeExplorer),
  PoseScatter: resettable(PoseScatter),
  RelativeVsGlobal: resettable(RelativeVsGlobal),
  RollingShutter: resettable(RollingShutter),
  SuperstructureMoves: resettable(SuperstructureMoves),
  SwerveGearing: resettable(SwerveGearing),
  SwerveKinematics: resettable(SwerveKinematics),
  SwerveSkew: resettable(SwerveSkew),
  TuningSandbox: resettable(TuningSandbox),
};

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
    DrivetrainComparison,
    DrivetrainLayout,
    FactorGraphDiagram,
    FrameChain,
    MechanismTypes,
    MK3Drawing,
    PinholeDiagram,
    RelativeGlobalDiagram,
    RobotLayouts,
    ShutterTimeline,
    ...widgets,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}

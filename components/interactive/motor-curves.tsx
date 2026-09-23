"use client";

import { useMemo, useState } from "react";

import { maxCurrentAt, MOTORS, rpmToRadPerSec, type Commutation, type MotorId } from "@/lib/motors";

import { fmt, MotorPicker, Readout, Slider, Widget } from "./controls";
import { LinePlot, type PlotBand } from "./plot";

interface MotorCurvesProps {
  /** Initial operating speed of the rotor (RPM). */
  initialSpeedRpm?: number;
  /** Initial stator current limit (A). */
  initialLimit?: number;
}

const SAMPLES = 120;

/**
 * Shows how much motor (stator) current, and so torque, a Kraken can produce at each speed. Back-EMF eats into the
 * supply voltage at high speed, and the stator current limit caps it at low speed. Also shows the battery (supply)
 * current that the same output draws. The same ceiling applies to voltage and torque-current requests.
 */
export const MotorCurves = ({ initialSpeedRpm = 4800, initialLimit = 80 }: MotorCurvesProps) => {
  const [motor, setMotor] = useState<MotorId>("x60");
  const [commutation, setCommutation] = useState<Commutation>("foc");
  const [supply, setSupply] = useState(12);
  const [limit, setLimit] = useState(initialLimit);
  const [speedRpm, setSpeedRpm] = useState(initialSpeedRpm);

  const m = useMemo(() => {
    const c = MOTORS[motor][commutation];
    // No-load speed at this supply voltage, where back-EMF equals the supply.
    const freeRpm = ((supply / c.ke) * 60) / (2 * Math.PI);
    const rpm = Math.min(speedRpm, freeRpm);
    const omega = rpmToRadPerSec(rpm);
    const unlimited = (w: number) => maxCurrentAt(c, supply, w);
    const limited = (w: number) => Math.min(limit, unlimited(w));
    const rpms = Array.from({ length: SAMPLES + 1 }, (_, i) => (i / SAMPLES) * freeRpm);
    const iMax = limited(omega);
    // Voltage the drive must apply to push iMax at this speed, and the battery current that takes (power balance,
    // ignoring controller losses). Supply current is lower than stator current whenever the motor voltage is below
    // the supply voltage.
    const motorVoltage = Math.min(supply, iMax * c.r + c.ke * omega);
    const supplyCurrent = (iMax * motorVoltage) / supply;
    const powerAt = (w: number) => c.kt * limited(w) * w;
    const peakPower = Math.max(...rpms.map((r) => powerAt(rpmToRadPerSec(r))));
    // Speed above which the voltage left after back-EMF, not the current limit, caps the current.
    const cornerRpm = Math.max(0, ((supply - limit * c.r) / c.ke) * (60 / (2 * Math.PI)));
    return {
      freeRpm,
      rpm,
      backEmf: c.ke * omega,
      headroom: Math.max(0, supply - c.ke * omega),
      iMax,
      torque: c.kt * iMax,
      motorVoltage,
      supplyCurrent,
      power: powerAt(omega),
      peakPower,
      cornerRpm,
      stallCurrent: supply / c.r,
      currentSeries: [
        {
          label: "Voltage-limited stator current",
          color: "var(--color-plot-muted)",
          dashed: true,
          points: rpms.map((r): [number, number] => [r, unlimited(rpmToRadPerSec(r))]),
        },
        {
          label: "Available stator current (with limit)",
          color: "var(--color-plot-1)",
          points: rpms.map((r): [number, number] => [r, limited(rpmToRadPerSec(r))]),
        },
      ],
      powerSeries: [
        {
          label: "Available mechanical power",
          color: "var(--color-plot-2)",
          points: rpms.map((r): [number, number] => [r, powerAt(rpmToRadPerSec(r))]),
        },
      ],
    };
  }, [motor, commutation, supply, limit, speedRpm]);

  const yMaxCurrent = Math.min(m.stallCurrent, Math.max(limit * 1.6, 60));

  // Shade the speed ranges where the current limit caps the current, and where the voltage left after back-EMF does.
  const corner = Math.min(Math.max(m.cornerRpm, 0), m.freeRpm);
  const zone = (from: number, to: number): [number, number][] => [
    [from, 0],
    [to, 0],
    [to, yMaxCurrent],
    [from, yMaxCurrent],
  ];
  const zones: PlotBand[] = [
    ...(corner > 0
      ? [{ label: "Current limit is the cap", color: "var(--color-plot-zone-1)", polygon: zone(0, corner) }]
      : []),
    ...(corner < m.freeRpm
      ? [{ label: "Voltage is the cap", color: "var(--color-plot-zone-2)", polygon: zone(corner, m.freeRpm) }]
      : []),
  ];

  return (
    <Widget title="Motor curves and voltage headroom">
      <div className="grid gap-4 sm:grid-cols-2">
        <MotorPicker
          motor={motor}
          commutation={commutation}
          onMotorChange={setMotor}
          onCommutationChange={setCommutation}
        />
        <Slider
          label="Supply voltage"
          value={supply}
          min={9}
          max={13}
          step={0.1}
          format={(v) => `${v.toFixed(1)} V`}
          onChange={setSupply}
        />
        <Slider
          label="Stator current limit"
          value={limit}
          min={10}
          max={200}
          step={5}
          format={(v) => `${v} A`}
          onChange={setLimit}
        />
        <div className="sm:col-span-2">
          <Slider
            label="Operating speed (rotor)"
            value={Math.min(speedRpm, m.freeRpm)}
            min={0}
            max={Math.floor(m.freeRpm)}
            step={10}
            format={(v) => `${fmt(v, 4)} RPM (${fmt(v / 60)} rot/s)`}
            onChange={setSpeedRpm}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Readout
          label="Back-EMF"
          value={fmt(m.backEmf)}
          unit={`V (${fmt((m.backEmf / supply) * 100, 2)}% of supply)`}
        />
        <Readout
          label="Voltage headroom"
          value={fmt(m.headroom)}
          unit="V"
        />
        <Readout
          label="Max stator current"
          value={fmt(m.iMax)}
          unit="A"
          emphasis
        />
        <Readout
          label="Supply (battery) current"
          value={fmt(m.supplyCurrent)}
          unit="A"
        />
        <Readout
          label="Voltage applied to the motor"
          value={fmt(m.motorVoltage)}
          unit="V"
        />
        <Readout
          label="Max motor torque"
          value={fmt(m.torque)}
          unit="N·m"
        />
        <Readout
          label="Mechanical power"
          value={fmt(m.power)}
          unit="W"
        />
        <Readout
          label="Voltage is the cap above"
          value={fmt(m.cornerRpm, 4)}
          unit="RPM"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Stator current the motor can draw at each speed</div>
        <LinePlot
          series={m.currentSeries}
          bands={zones}
          markers={[
            { x: m.rpm, label: "operating speed" },
            { y: limit, label: `${limit} A stator limit`, color: "var(--color-plot-2)" },
          ]}
          xMax={m.freeRpm}
          yMax={yMaxCurrent}
          xLabel="rotor speed (RPM)"
          yLabel="stator current (A)"
          ariaLabel="Available stator current versus rotor speed, falling linearly to zero at free speed, capped by the stator current limit"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Mechanical power</div>
        <LinePlot
          series={m.powerSeries}
          markers={[{ x: m.rpm, label: "operating speed" }]}
          xMax={m.freeRpm}
          yMax={m.peakPower * 1.15}
          xLabel="rotor speed (RPM)"
          yLabel="power (W)"
          ariaLabel="Available mechanical power versus rotor speed"
        />
      </div>

      <p className="text-sm text-fd-muted-foreground">
        At <strong className="text-fd-foreground">{fmt(m.rpm, 4)} RPM</strong>, back-EMF uses {fmt(m.backEmf)} V of the{" "}
        {supply.toFixed(1)} V supply, so at most <strong className="text-fd-foreground">{fmt(m.iMax)} A</strong> of
        stator current is available for torque. This ceiling is the same in voltage and torque-current mode. Torque mode
        changes how the loop uses the current, not how much there is.
      </p>
      <p className="text-sm text-fd-muted-foreground">
        <strong className="text-fd-foreground">Which limit is this?</strong> The slider is the{" "}
        <strong className="text-fd-foreground">stator</strong> current limit (<code>StatorCurrentLimit</code>, default
        120 A), which caps current in the motor windings and so caps torque. In torque-current mode,{" "}
        <code>PeakForwardTorqueCurrent</code> / <code>PeakReverseTorqueCurrent</code> cap it the same way. The{" "}
        <strong className="text-fd-foreground">supply</strong> limit (<code>SupplyCurrentLimit</code>) caps battery
        current instead. At low speed the motor needs only a fraction of the supply voltage, so supply current is much
        lower than stator current. That is why the supply limit protects the battery but does little to limit torque at
        low speed.
      </p>
      <p className="text-xs text-fd-muted-foreground">
        Uses the effective constants from the Motor Constants page. Ignores free current, friction, and temperature. The
        effective resistance rises about 25% when the motor is hot, which lowers every current in this chart.
      </p>
    </Widget>
  );
};

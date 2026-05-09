# CTRE Control Modes Tuning for FRC

*A comprehensive yet practical reference for closed-loop tuning on Phoenix 6 hardware (Talon FX(S), Kraken X60/X44), covering both voltage and torque-current control across the five most common mechanism archetypes.*

---

## Table of Contents

1. [Conceptual Foundation](#1-conceptual-foundation)
   - 1.1 [The Phoenix 6 Output Families](#11-the-phoenix-6-output-families)
   - 1.2 [The PIDSVAGJ Slot Model](#12-the-pidsvagj-slot-model)
     - 1.2.1 [The `StaticFeedforwardSign` Config](#121-the-staticfeedforwardsign-config)
   - 1.3 [The Most Important Conceptual Point](#13-the-most-important-conceptual-point)
   - 1.4 [Profiled vs. Simple Control](#14-profiled-vs-simple-control)
     - 1.4.1 [Motion Magic Expo in Detail](#141-motion-magic-expo-in-detail)
     - 1.4.2 [Tuning Motion Magic Expo Parameters](#142-tuning-motion-magic-expo-parameters)
     - 1.4.3 [Common Mistakes with Motion Magic Expo](#143-common-mistakes-with-motion-magic-expo)
   - 1.5 [General Tuning Workflow](#15-general-tuning-workflow)
   - 1.6 [Motor Constants Reference](#16-motor-constants-reference)
     - 1.6.1 [Published Nominal Specifications](#161-published-nominal-specifications)
     - 1.6.2 [Derived Electromechanical Constants](#162-derived-electromechanical-constants)
     - 1.6.3 [Quick-Reference Calculation Examples](#163-quick-reference-calculation-examples)
     - 1.6.4 [Caveats](#164-caveats)
2. [Voltage-Based Control](#2-voltage-based-control)
   - 2.1 [Flywheel (Velocity)](#21-flywheel-velocity)
   - 2.2 [Turret (Position)](#22-turret-position)
   - 2.3 [Arm (Position)](#23-arm-position)
   - 2.4 [Elevator (Position)](#24-elevator-position)
   - 2.5 [Linear Deployment (Position)](#25-linear-deployment-position)
3. [Torque-Current (FOC) Control](#3-torque-current-foc-control)
   - 3.0.1 [Why Torque Control is Different](#301-why-torque-control-is-different)
   - 3.0.2 [Tuning Implications](#302-tuning-implications)
   - 3.0.3 [Feedforward in Torque Mode](#303-feedforward-in-torque-mode)
   - 3.0.4 [Why You Cannot Use SysId for Torque-Current Tuning](#304-why-you-cannot-use-sysid-for-torque-current-tuning)
   - 3.0.5 [Profiled Tuning (Motion Magic with TorqueCurrentFOC)](#305-profiled-tuning-motion-magic-with-torquecurrentfoc)
   - 3.1 [Flywheel (Velocity)](#31-flywheel-velocity)
   - 3.2 [Turret (Position)](#32-turret-position)
   - 3.3 [Arm (Position)](#33-arm-position)
   - 3.4 [Elevator (Position)](#34-elevator-position)
   - 3.5 [Linear Deployment (Position)](#35-linear-deployment-position)
4. [Voltage vs. Torque: Selection Guide](#4-voltage-vs-torque-selection-guide)
   - 4.1 [Quick Recommendations](#41-quick-recommendations)
   - 4.2 [Detailed Selection Criteria](#42-detailed-selection-criteria)
   - 4.3 [Mixed-Mode Strategies](#43-mixed-mode-strategies)
   - 4.4 [Common Migration Pitfalls](#44-common-migration-pitfalls)

---

## 1. Conceptual Foundation

### 1.1 The Phoenix 6 Output Families

Every closed-loop request on a Talon FX(S) in Phoenix 6 belongs to one of three output families. The output type determines the units of every gain you tune.

| Family | Example Requests | Output Units | When to Use |
|:---|:---|:---|:---|
| **DutyCycle** | `VelocityDutyCycle`, `PositionDutyCycle`, `MotionMagicDutyCycle` | Normalized [-1, 1] | Early bring-up only. Battery sag distorts behavior. |
| **Voltage** | `VelocityVoltage`, `PositionVoltage`, `MotionMagicVoltage` | Volts | Default for nearly everything. Battery-compensated. |
| **TorqueCurrent (FOC)** | `VelocityTorqueCurrentFOC`, `PositionTorqueCurrentFOC`, `MotionMagicTorqueCurrentFOC` | Amps (stator torque-producing current) | Phoenix Pro + Kraken X60/X44. Direct torque control. |

**Key fact:** gains do not transfer between families. Different output families have different units and different physics, so switching from voltage to torque-current requires re-tuning from scratch.

### 1.2 The PIDSVAGJ Slot Model

Phoenix 6 provides three configurable gain slots per motor. Each slot contains the following parameters:

$$
u(t) = \underbrace{k_S \cdot \sigma_{\text{kS}} + k_V \cdot v_{\text{ref}} + k_A \cdot a_{\text{ref}} + k_G \cdot g(\theta)}_{\text{feedforward}} + \underbrace{k_P \cdot e + k_I \int e\\,dt + k_D \cdot \dot{e}}_{\text{feedback (PID)}}
$$

Where:
- $u(t)$ is the controller output (Volts or Amps depending on family)
- $e = x_{\text{ref}} - x_{\text{measured}}$ is the tracking error
- $v_{\text{ref}}$, $a_{\text{ref}}$ are reference velocity and acceleration (from a profile, or directly commanded)
- $g(\theta)$ is a gravity term: $\cos(\theta)$ for arms, $1$ for elevators, $0$ for everything else
- $\sigma_{\text{kS}} \in \lbrace-1, 0, +1\rbrace$ is the static-friction compensation sign, whose source depends on the control mode and the `StaticFeedforwardSign` config (see [§1.2.1](#121-the-staticfeedforwardsign-config) below)

| Gain | Meaning | Unit (Voltage Mode) | Unit (Torque Mode) |
|:---|:---|:---|:---|
| **kP** | Output per unit error | V / (mechanism unit) | A / (mechanism unit) |
| **kI** | Output per unit accumulated error | V / (mechanism unit · s) | A / (mechanism unit · s) |
| **kD** | Output per unit error rate | V / (mechanism unit / s) | A / (mechanism unit / s) |
| **kS** | Static friction compensation | V | A |
| **kV** | Velocity feedforward | V / (rotation/s) | A / (rotation/s) — typically 0 |
| **kA** | Acceleration feedforward | V / (rotation/s²) | A / (rotation/s²) ≈ inertia × ratio |
| **kG** | Gravity feedforward | V | A |

#### 1.2.1 The `StaticFeedforwardSign` Config

The kS term opposes static friction, so its sign must always match the direction the mechanism is trying to move. Phoenix 6 provides two ways to determine that sign, controlled by the `StaticFeedforwardSign` field in each gain slot (`Slot0Configs.StaticFeedforwardSign`, etc.):

| Value | $\sigma_{\text{kS}}$ source | When it applies |
|:---|:---|:---|
| `UseVelocitySign` *(default)* | $\mathrm{sgn}(v_{\text{ref}})$ — sign of velocity reference | **Always** used in velocity closed-loop modes. Recommended for Motion Magic and any motion-profiled position closed-loop modes. |
| `UseClosedLoopSign` | $\mathrm{sgn}(e)$ — sign of position closed-loop error | Useful in **non-profiled** position closed-loop modes (`PositionVoltage`, `PositionTorqueCurrentFOC`) where $v_{\text{ref}} = 0$ and the velocity-sign approach would always produce $\sigma_{\text{kS}} = 0$. |

**The config only affects position closed-loop control.** In velocity modes (`VelocityVoltage`, `VelocityTorqueCurrentFOC`) the sign is always derived from the velocity reference regardless of this setting.

**Why this matters:** with a non-profiled position request and `UseVelocitySign` (the default), $v_{\text{ref}}$ is zero, so $\sigma_{\text{kS}} = \mathrm{sgn}(0) = 0$ and **no kS is applied**. The mechanism then has to develop closed-loop error large enough for kP to overcome static friction by itself, which produces a small steady-state offset. Switching to `UseClosedLoopSign` lets the controller apply kS in the direction of error, eliminating the offset.

**The trade-off is dither:** when error is small and noise pushes it across zero, the kS term flips sign at every loop iteration, causing audible chatter and unnecessary motor heating. CTRE's official recommendation is therefore: if you use `UseClosedLoopSign`, keep kS as small as possible (just enough to break stiction), or add a small deadband in software around zero error.

**Decision rule for each control mode:**

- `VelocityVoltage`, `VelocityTorqueCurrentFOC` → setting is ignored. Sign is always $\mathrm{sgn}(v_{\text{ref}})$.
- `MotionMagic*Voltage`, `MotionMagic*TorqueCurrentFOC` (any profiled position) → use `UseVelocitySign` (default). The profile generator produces a meaningful $v_{\text{ref}}$ at every loop, so kS gets applied during motion and naturally goes to zero when the mechanism stops at the setpoint.
- `PositionVoltage`, `PositionTorqueCurrentFOC` with no `Velocity` argument (pure position) → use `UseClosedLoopSign`. Otherwise kS will not assist breaking stiction on small corrections.
- `PositionVoltage`, `PositionTorqueCurrentFOC` **with** a non-zero `Velocity` argument (manual motion profiling done in user code) → use `UseVelocitySign` (default), since you are providing a meaningful velocity reference.

This config will be referenced in the per-mechanism procedures below.

### 1.3 The Most Important Conceptual Point

> **Feedforwards do the heavy lifting; PID corrects residual error.**

If your kS, kV, kA, and kG are correct, kP only needs to be large enough to reject disturbances and modeling error. Cranking kP to compensate for missing feedforward gives you oscillation, overshoot, and a system that is fragile to mechanical changes (a stretched chain, a new battery, a different game piece weight). Get the physics in feedforward, then close the loop on what's left.

### 1.4 Profiled vs. Simple Control

For position control, you have a choice between:

**Simple PID** — `PositionVoltage` / `PositionTorqueCurrentFOC`. Commands a step setpoint; the controller drives error to zero as fast as gains allow. The trajectory through the workspace is uncontrolled and can demand instantaneous infinite acceleration, leading to current spikes, mechanical stress, and overshoot.

**Motion Magic (trapezoidal)** — `MotionMagicVoltage` / `MotionMagicTorqueCurrentFOC`. Generates a trapezoidal velocity profile bounded by configured cruise velocity ($v_{\max}$), acceleration ($a_{\max}$), and optional jerk ($j_{\max}$, which makes it S-curve / 7-segment). The PID sees a moving target that it can actually keep up with.

The motion profile produces position, velocity, and acceleration references at every loop. With proper feedforward, the controller can track these very tightly:

$$
\theta_{\text{ref}}(t), \quad \dot{\theta}_{\text{ref}}(t) = v_{\text{ref}}(t), \quad \ddot{\theta}_{\text{ref}}(t) = a_{\text{ref}}(t)
$$

**Motion Magic Expo** — `MotionMagicExpoVoltage` / `MotionMagicExpoTorqueCurrentFOC`. Generates an exponential profile shaped by the motor's own dynamics rather than user-specified kinematic limits. Detailed in [§1.4.1](#141-motion-magic-expo-in-detail) below.

**When to use which:**

- **Simple PID** — flywheels, small/short moves where the trajectory shape doesn't matter, or as a fallback during early tuning before you've characterized the mechanism.
- **Motion Magic Trapezoidal** — when you have a hard kinematic budget you want to enforce (e.g., "this arm must never accelerate faster than X to avoid tipping"), or when you want a fixed-shape profile for repeatability.
- **Motion Magic Expo** — preferred default for arms, elevators, and turrets. It self-tunes to the available motor authority and produces achievable trajectories.

#### 1.4.1 Motion Magic Expo in Detail

Trapezoidal Motion Magic asks "what's the fastest the user said this mechanism may move?" Motion Magic Expo asks "what's the fastest this mechanism actually *can* move?" That difference matters because the user-specified trapezoidal acceleration is often either too aggressive (the motor saturates and the actual response lags behind the profile) or too conservative (you're leaving time on the table). Expo sidesteps the question entirely by modeling the motor.

**The underlying physics.** A brushless DC motor in steady state obeys the armature equation:

$$
V = R \cdot I + k_e \cdot \omega
$$

where $V$ is the applied voltage at the motor terminals, $R$ is winding resistance, $I$ is the torque-producing current, $k_e$ is the back-EMF constant (V·s/rad), and $\omega$ is rotor angular velocity (rad/s). The first term is the resistive drop; the second is the back-EMF voltage the motor generates as it spins. (Inductance is neglected because the electrical time constant $L/R$ is far shorter than the mechanical time constant.)

The motor produces torque proportional to current, $\tau = k_t \cdot I$, so substituting and solving for torque:

$$
\tau = \frac{k_t}{R}\\,(V - k_e \cdot \omega)
$$

This is the key result. Torque is linear in applied voltage and decreases linearly with rotor speed. At $\omega = 0$ (rest), all voltage drives current through resistance and torque is maximum. At the no-load speed $\omega_{\max} = V/k_e$, back-EMF exactly balances applied voltage, current is zero, and torque is zero.

**Deriving the exponential profile.** Apply Newton's second law to a rotor with reflected inertia $J$ (combining motor rotor + mechanism inertia reflected through the gearbox), with no external load:

$$
J \frac{d\omega}{dt} = \tau = \frac{k_t}{R}\\,(V - k_e \cdot \omega)
$$

Rearranging into standard first-order linear ODE form:

$$
\frac{d\omega}{dt} + \frac{k_t \cdot k_e}{R \cdot J}\\,\omega = \frac{k_t}{R \cdot J}\\,V
$$

This is a first-order linear ODE with time constant:

$$
\tau_m = \frac{R \cdot J}{k_t \cdot k_e}
$$

For a step voltage input $V$ applied at $t = 0$ with $\omega(0) = 0$, the solution is the standard exponential rise:

$$
\omega(t) = \omega_{\max}\\,\bigl(1 - e^{-t/\tau_m}\bigr), \quad \omega_{\max} = \frac{V}{k_e}
$$

**This is the trajectory Motion Magic Expo generates.** When you command Expo to move from rest to a setpoint, the profile says "this is what the motor would naturally do at full voltage" — the profile rises exponentially toward $\omega_{\max}$ with time constant $\tau_m$. By construction, the closed-loop request is something the motor can actually deliver.

**The Expo configs.** Two fields in `MotionMagicConfigs` parametrize this behavior:

- **`MotionMagicExpo_kV`** — voltage required to hold a steady velocity, in V/(rotation/s) of the *mechanism*. Equivalent to the slot-gain kV you'd identify with SysId in voltage mode (after sensor-to-mechanism scaling).
- **`MotionMagicExpo_kA`** — voltage required to produce a unit acceleration at zero speed, in V/(rotation/s²) of the mechanism. Equivalent to the slot-gain kA in voltage mode.

These map directly to the motor parameters above. To hold steady velocity, the no-friction motor needs only enough voltage to balance back-EMF ($I = 0$, so $V = k_e \omega$). At the mechanism (after gear ratio $G$, where $G > 1$ is a reduction), the voltage required per unit mechanism velocity is:

$$
\text{Expo\\_kV} = 2\pi \cdot k_e \cdot G \quad \text{[V per mechanism rotation/s]}
$$

(The $2\pi$ converts rad/s to rotation/s.) To produce acceleration at zero speed, the motor needs $V = R \cdot I = R \cdot \tau / k_t = R \cdot J \cdot \dot\omega / k_t$ for an inertia $J$ reflected to the rotor. At the mechanism (mechanism acceleration = rotor acceleration / G), the voltage per unit mechanism acceleration is:

$$
\text{Expo\\_kA} = 2\pi \\, \frac{R \cdot J \cdot G}{k_t} \quad \text{[V per mechanism rotation/s²]}
$$

Critically: **both Expo configs are always in Volts, even when the closed-loop control mode is TorqueCurrentFOC or DutyCycle.** This is a deliberate design choice — the profile generator needs a consistent unit to reason about motor saturation. There is no `MotionMagicExpo_kVFOC` or similar; the same fields apply across all output families.

**The maximum profile velocity** is the no-load speed at the supply voltage. Setting $V = V_{\text{supply}}$ and $I = 0$ in the armature equation gives $V_{\text{supply}} = k_e \cdot \omega_{\max}$, so:

$$
v_{\max,\text{profile}} = \frac{V_{\text{supply}}}{\text{Expo\\_kV}}
$$

**The maximum profile acceleration (from rest)** is what the motor produces at $\omega = 0$ when full supply voltage is applied — all of $V_{\text{supply}}$ drives current through resistance, which drives torque, which drives acceleration:

$$
a_{\max,\text{profile, from rest}} = \frac{V_{\text{supply}}}{\text{Expo\\_kA}}
$$

So **higher Expo_kV → lower top speed; higher Expo_kA → lower acceleration.** This is the opposite intuition from kP — bigger Expo values produce slower profiles, not faster ones. That's because a "high-kV motor" in this context means one that needs a lot of voltage per rps, i.e. doesn't spin very fast on a 12 V bus.

**The profile time constant** falls out of the ratio of Expo configs:

$$
\tau_{\text{profile}} = \frac{\text{Expo\\_kA}}{\text{Expo\\_kV}}
$$

To see why this equals the motor time constant $\tau_m$, substitute the definitions above:

$$
\frac{\text{Expo\\_kA}}{\text{Expo\\_kV}} = \frac{2\pi \cdot R \cdot J \cdot G / k_t}{2\pi \cdot k_e \cdot G} = \frac{R \cdot J}{k_t \cdot k_e} = \tau_m
$$

The factors of $2\pi$ and $G$ cancel — they're just unit conventions that affect both configs identically. So the time constant is purely a function of the motor's electromechanical properties and the reflected inertia, independent of the gear ratio (as long as $J$ is the inertia reflected to the rotor).

**The trajectory Expo actually generates** for a step setpoint, starting from rest, is:

$$
v(t) = v_{\max,\text{profile}}\\,\bigl(1 - e^{-t/\tau_{\text{profile}}}\bigr)
$$

This is the same equation as the motor's natural step response — by design. Differentiating yields the acceleration trace:

$$
a(t) = \frac{v_{\max,\text{profile}}}{\tau_{\text{profile}}}\\,e^{-t/\tau_{\text{profile}}} = a_{\max,\text{from rest}} \cdot e^{-t/\tau_{\text{profile}}}
$$

The middle equality uses:

$$
v_{\max}/\tau = (V/\text{Expo\\_kV}) / (\text{Expo\\_kA}/\text{Expo\\_kV}) = V/\text{Expo\\_kA} = a_{\max,\text{from rest}}
$$

Acceleration is **highest at $t = 0$** (when there's no back-EMF to fight) and **decays exponentially toward zero** as the mechanism approaches cruise. After one time constant ($t = \tau_{\text{profile}}$), the velocity has reached $1 - 1/e \approx 63\\%$ of $v_{\max}$ and acceleration has dropped to $1/e \approx 37\\%$ of its initial value. The deceleration phase mirrors this in reverse, with the same time constant.

**Numerical sanity check.** For a Kraken X60 (FOC) at 12 V supply, with values from [§1.6.2](#162-derived-electromechanical-constants):
- $k_e = 0.0198$ V·s/rad, $k_t = 0.0194$ N·m/A, $R = 0.0248$ Ω
- Mechanism with $G = 50:1$ reduction and reflected inertia $J = 1 \times 10^{-4}$ kg·m² at the rotor (a small turret).
- $\text{Expo\\_kV} = 2\pi \cdot 0.0198 \cdot 50 \approx 6.22$ V per (mechanism rotation/s)
- $\text{Expo\\_kA} = 2\pi \cdot (0.0248 \cdot 10^{-4} \cdot 50) / 0.0194 \approx 0.040$ V per (mechanism rotation/s²)
- $v_{\max,\text{profile}} = 12 / 6.22 \approx 1.93$ rotation/s ≈ 116 RPM at the mechanism
- $a_{\max,\text{from rest}} = 12 / 0.040 = 300$ rotation/s² (instantaneous, decays from there)
- $\tau_{\text{profile}} = 0.040 / 6.22 \approx 0.0064$ s = 6.4 ms

After 6.4 ms (one time constant), the mechanism is moving at ~73 RPM (63% of cruise). After 3 time constants (~19 ms), it's at ~110 RPM (95% of cruise). Whether 6 ms is realistic depends on inertia — increase $J$ by 10× (a heavier mechanism) and the time constant grows to 64 ms. Real FRC mechanisms often land in the 30–100 ms range.

**The optional cruise velocity.** You can additionally specify `MotionMagicCruiseVelocity` to clip the profile at a velocity below $v_{\max,\text{profile}}$. Setting it to 0 means "don't clip" — the profile is allowed to ride right up to $V_{\text{supply}}/\text{Expo\\_kV}$. Any nonzero value tells the profile generator: "even though the motor *could* go faster, I want you to cruise at this speed once you reach it." Useful when you want to limit top speed for mechanical reasons (chain wear, vibration) without changing the acceleration shape.

The Expo profile does **not** use `MotionMagicAcceleration` or `MotionMagicJerk` — these configs are only consulted by trapezoidal Motion Magic.

**Why this is better than tuning trapezoidal acceleration.** With a trapezoidal profile, the user picks $a_{\max}$ as a guess at what the motor can deliver. If you guess too low, the profile is artificially slow. If you guess too high, the profile commands more acceleration than the motor can produce, the motor saturates, and the actual response lags the profile by an amount that grows with speed. Either way, the controller's PID has to absorb the mismatch through error.

With Expo, the profile by construction commands an acceleration the motor can deliver at the current speed — because the underlying ODE *is* the motor model. So the feedforward terms (kS, kV, kA, kG in the slot) cleanly cancel the modeled motor behavior, and the PID corrects only residual error from disturbances and modeling inaccuracies. Tracking error is dramatically lower.

**How the slot kV/kA relate to Expo_kV/Expo_kA.** They serve different purposes:

| Parameter | Used by | Purpose |
|:---|:---|:---|
| `Slot0Configs.kV` | The closed-loop feedforward at every cycle | Voltage to apply per unit of *commanded* velocity (from the profile) so the motor produces that velocity |
| `Slot0Configs.kA` | The closed-loop feedforward at every cycle | Voltage to apply per unit of *commanded* acceleration so the motor produces that acceleration |
| `MotionMagicExpo_kV` | The profile generator | Voltage needed to *hold* a velocity — used to compute max profile velocity |
| `MotionMagicExpo_kA` | The profile generator | Voltage needed to *cause* an acceleration — used to compute max profile acceleration and time constant |

In voltage mode, the slot and Expo values represent the same physical quantity and should be equal (within tuning noise). In torque-current mode, the slot kV is in Amps and is typically near zero (since torque-current already linearizes back-EMF), but `MotionMagicExpo_kV` is still in Volts and still represents the back-EMF voltage characteristic of the motor — they are decoupled and both must be set.

#### 1.4.2 Tuning Motion Magic Expo Parameters

The standard recommendation is to start with the SysId-identified kV and kA from voltage-mode characterization, plug them in, and refine empirically. CTRE explicitly notes that **it is safer to start with `MotionMagicExpo_kV` higher than ideal** — too-high kV slows the profile (which is safe), while too-low kV produces a profile that demands more velocity than the motor can deliver (which causes the actual mechanism to lag behind the reference).

**Step-by-step tuning procedure** (assumes you've already tuned slot kV, kA, kP, kD):

1. **Initial values.** Set `MotionMagicExpo_kV = Slot0Configs.kV` and `MotionMagicExpo_kA = Slot0Configs.kA` (in voltage mode). For torque-current mode, use the equivalent voltage-mode kV/kA values from a SysId run done in voltage mode — same motor, same gear ratio, same load. Set `MotionMagicCruiseVelocity = 0` to start (no clipping).

2. **Bias `MotionMagicExpo_kV` upward.** Multiply your initial Expo_kV by ~1.1 to 1.2 as a safety margin. This shaves a little off the top profile speed but guarantees the motor can keep up. You can pull it back down later once you have data.

3. **Command a long move and log the response.** Use AdvantageScope or Tuner X to plot:
   - `ClosedLoopReference` (the position the profile is commanding)
   - `ClosedLoopReferenceSlope` (the velocity the profile is commanding)
   - The actual `Position` and `Velocity` signals
   - `MotorVoltage` (or `StatorCurrent` for torque mode)

4. **Inspect the velocity trace.**
   - If the actual velocity tracks the reference closely → kV is correct.
   - If actual velocity falls behind reference (gap grows during cruise) → Expo_kV is too low; the profile is asking for more speed than the motor can produce. Increase Expo_kV until the traces align.
   - If actual velocity matches reference but motor voltage is well below supply during cruise → Expo_kV is too high; you have headroom you're not using. Decrease Expo_kV (small steps, e.g., 5%) to claim more performance.

5. **Inspect the acceleration phase.**
   - If actual velocity rises *faster* than the reference at the start of the move → Expo_kA is too high; the motor is more responsive than the profile assumes. Decrease Expo_kA.
   - If actual velocity rises *slower* than the reference at the start → Expo_kA is too low; the profile is commanding more acceleration than the motor delivers. Increase Expo_kA.

6. **Add cruise velocity if needed.** If the now-accurate profile produces a top speed that's mechanically uncomfortable (vibration, chain whip, etc.), set `MotionMagicCruiseVelocity` to a value below $V_{\text{supply}}/\text{Expo\\_kV}$ to clip it.

7. **Validate at extreme conditions.** Re-run the test with:
   - A weak battery (< 12.0 V resting). Expo automatically scales because $v_{\max} = V_{\text{supply}}/\text{Expo\\_kV}$ — but verify tracking is still tight.
   - The mechanism in its worst-case configuration (arm at horizontal, elevator fully extended). Gravity loading can change the effective kV/kA.
   - A short move (under one time constant). This stresses the deceleration tail; tracking errors here often reveal under-tuned Expo_kA.

#### 1.4.3 Common Mistakes with Motion Magic Expo

- **Confusing Expo_kV with slot kV in torque mode.** Slot kV in TorqueCurrentFOC is in Amps and often near zero. `MotionMagicExpo_kV` is still in Volts and represents the motor's back-EMF characteristic. Setting Expo_kV ≈ 0 because "I'm in torque mode and slot kV is zero" produces a profile that asks for infinite velocity — the motor saturates immediately and you get a step response.

- **Forgetting to set `MotionMagicExpo_kV` and `MotionMagicExpo_kA`.** The default values are not zero — Phoenix 6 promotes a Expo_kV of 0 to a default of 0.12, but Expo_kA's default is unhelpful for most mechanisms. Always set both explicitly.

- **Trying to use `MotionMagicAcceleration` with Expo.** It's silently ignored. If you want to limit acceleration, increase Expo_kA. If you want to limit jerk, you can't — Expo doesn't have a jerk parameter (the exponential profile has bounded but non-zero jerk by construction).

- **Tuning Expo_kV/Expo_kA before tuning slot kV/kA/kP/kD.** The profile is only useful if the closed loop can track it. If your slot gains are wrong, you'll see tracking error and incorrectly conclude that Expo_kV needs adjustment. Always tune the closed loop on slow setpoints first, then tune the profile.

- **Battery voltage compensation surprises.** Profile velocity is computed against measured supply voltage. If a brownout drops the bus to 10 V, the profile's max velocity drops to $10/\text{Expo\\_kV}$ for that cycle. Usually fine; occasionally produces visible velocity dips on power-hungry systems. Phoenix 6 handles this internally and the ClosedLoopReference will reflect the real-time recalculation.

### 1.5 General Tuning Workflow

1. Set sensor-to-mechanism ratio in `FeedbackConfigs` so all units are mechanism units (degrees, meters, etc.).
2. Configure `StaticFeedforwardSign` in each gain slot based on the control mode you'll use (see [§1.2.1](#121-the-staticfeedforwardsign-config)). For Motion Magic and velocity modes, leave the default `UseVelocitySign`. For non-profiled `PositionVoltage` or `PositionTorqueCurrentFOC`, set it to `UseClosedLoopSign`.
3. Run SysId (voltage mode only) or do manual characterization. SysId is the standard approach for voltage-mode mechanisms; for torque-current mode, calculate gains from first principles (see Section 3). Get kS, kV, kA, and (for arms/elevators) kG in the units appropriate to your output family.
4. Plug feedforwards in, set PID to zero. Verify the mechanism roughly tracks slow setpoints from feedforward alone.
5. Add kP. Increase until disturbance rejection is acceptable without sustained oscillation.
6. Add kD if oscillating during position moves. Start around kP/100 for voltage-mode and kP/10 for torque-mode.
7. Add kI only as a last resort, for unmodeled steady-state error.
8. Tune profile parameters (cruise velocity, acceleration) only after PID+FF works for arbitrary setpoints.

### 1.6 Motor Constants Reference

The first-principles calculations throughout this document (especially in [§3](#3-torque-current-foc-control) for torque-current mode) require motor electromechanical constants. The table below collects the published nominal values for the two CTRE Kraken motors in both commutation modes.

**Note on commutation mode.** The same physical motor produces *different* effective constants depending on commutation strategy. Trapezoidal commutation (the default for `VoltageOut`, `DutyCycleOut`, `PositionVoltage`, `MotionMagicVoltage`, etc., when the device is not Pro-licensed or `EnableFOC = false`) drives only two of the three motor phases at a time. FOC commutation (used by all `*TorqueCurrentFOC` requests, and by other requests when Phoenix Pro is licensed and `EnableFOC = true`) drives all three phases continuously with sinusoidal current control. FOC produces ~15% more torque at stall and slightly lower free speed because it can fully utilize the rotor magnetic field at every angle.

When choosing which column to use:
- **Voltage-mode control on a Pro-licensed device with `EnableFOC = true`** — use the FOC column (the underlying commutation is FOC).
- **Voltage-mode control on a non-Pro device, or with `EnableFOC = false`** — use the Trapezoidal column.
- **Any `*TorqueCurrentFOC` control request** — use the FOC column.

#### 1.6.1 Published Nominal Specifications

| Parameter | Kraken X60 (Trap) | Kraken X60 (FOC) | Kraken X44 (Trap) | Kraken X44 (FOC) |
|:---|---:|---:|---:|---:|
| Free Speed @ 12 V | 6000 RPM | 5800 RPM | 7758 RPM | 7368 RPM |
| Free Speed @ 12 V (rad/s) | 628.3 | 607.4 | 812.5 | 771.6 |
| Free Current | 2 A | 2 A | 3 A | 3 A |
| Stall Torque | 7.09 N·m | 9.37 N·m | 4.11 N·m | 5.01 N·m |
| Stall Current | 366 A | 483 A | 279 A | 329 A |
| Peak Power | 1108 W | 1405 W | 835 W | 966 W |
| Max Efficiency | 87% @ 30 A | 85.4% @ 37 A | 81% | 81% |

Sources: WestCoast Products [Kraken X60](https://docs.wcproducts.com/welcome/electronics/kraken-x60/kraken-x60-motor/overview-and-features/motor-performance) and [Kraken X44](https://docs.wcproducts.com/welcome/electronics/kraken-x44/kraken-x44-motor/overview-and-features/motor-performance) documentation.

#### 1.6.2 Derived Electromechanical Constants

These are the values you actually use in feedforward calculations. They are derived from the nominal specs above (with $V_{\text{nom}} = 12$ V):

| Constant | Symbol | Kraken X60 (Trap) | Kraken X60 (FOC) | Kraken X44 (Trap) | Kraken X44 (FOC) |
|:---|:---|---:|---:|---:|---:|
| Torque constant | $k_t$ (N·m/A) | 0.0194 | 0.0194 | 0.0149 | 0.0154 |
| Back-EMF constant | $k_e$ (V·s/rad) | 0.0191 | 0.0198 | 0.0148 | 0.0156 |
| Velocity constant | $K_v$ (RPM/V) | 500.0 | 483.3 | 646.5 | 614.0 |
| Winding resistance | $R$ ($\Omega$) | 0.0328 | 0.0248 | 0.0430 | 0.0365 |

**Derivation reminders.** Each constant comes from a different part of the spec table. Pay attention to units — most ambiguity in motor data sheets comes from mixing rad/s, rotation/s, and RPM.

$$
k_t = \frac{\tau_{\text{stall}}}{I_{\text{stall}}} \quad \text{[N·m/A]}
$$

$$
k_e = \frac{V_{\text{nom}}}{\omega_{\text{free}}} \quad \text{[V·s/rad, with $\omega_{\text{free}}$ in rad/s]}
$$

$$
K_v = \frac{\omega_{\text{free, RPM}}}{V_{\text{nom}}} \quad \text{[RPM/V, with $\omega_{\text{free, RPM}}$ in RPM]}
$$

$$
R = \frac{V_{\text{nom}}}{I_{\text{stall}}} \quad \text{[$\Omega$]}
$$

Note that $K_v$ (the "Kv rating" used by the hobbyist BLDC community, in RPM/V) and $k_e$ (the back-EMF constant in SI units, V·s/rad) are reciprocals of each other up to a $2\pi/60$ unit conversion: $k_e = 60 / (2\pi \cdot K_v)$.

For SI units, $k_t$ (N·m/A) and $k_e$ (V·s/rad) are numerically identical for an ideal motor and very close in practice — small differences come from friction and iron losses. Use $k_t$ for torque/current calculations and $k_e$ for back-EMF/voltage calculations.

#### 1.6.3 Quick-Reference Calculation Examples

**Holding current for an arm at horizontal** (from [§3.3.2](#332-first-principles-kg-in-torque-mode)):

$$
I_{\text{hold}} = \frac{m \cdot g \cdot L_{\text{cg}}}{G \cdot k_t}
$$

For a 5 kg arm with 0.4 m CG distance, 100:1 ratio, on a Kraken X60 (FOC, $k_t = 0.0194$):

$$
I_{\text{hold}} = \frac{5 \cdot 9.81 \cdot 0.4}{100 \cdot 0.0194} = 10.1 \text{ A}
$$

On a Kraken X44 (FOC, $k_t = 0.0154$), the same arm would need:

$$
I_{\text{hold}} = \frac{5 \cdot 9.81 \cdot 0.4}{100 \cdot 0.0154} = 12.7 \text{ A}
$$

The X44 requires ~26% more current to hold the same torque — useful when sizing the gearbox.

**Voltage-mode kV** (V/(rotation/s) at the *motor rotor*):

$$
k_V^{\text{rotor}} = \frac{V_{\text{nom}}}{\omega_{\text{free}} / (2\pi)} = \frac{2\pi \cdot V_{\text{nom}}}{\omega_{\text{free}}}
$$

For a Kraken X60 (Trap): $k_V^{\text{rotor}} = (2\pi \cdot 12) / 628.3 = 0.120$ V/(rotation/s). This is the **theoretical no-friction** value — actual measured kV from SysId will be slightly higher due to viscous drag and gear-train friction. Use the table value as a sanity check on SysId outputs (typically within 5–15%).

**No-load top speed of a geared mechanism** (rotations/sec at the output):

$$
\omega_{\text{out, no-load}} = \frac{V_{\text{supply}}}{k_V^{\text{rotor}} \cdot G}
$$

For the Kraken X60 turret example earlier (50:1 ratio, 12 V supply): $\omega_{\text{out}} = 12 / (0.120 \cdot 50) = 2.0$ rps = 720°/s. Real-world top speed will be somewhat lower due to load and friction.

#### 1.6.4 Caveats

- **Motor-to-motor variation.** Published values are batch nominals. Individual motors can vary ±5% on $k_t$ and ±10% on $R$. SysId will capture the actual values for *your specific motor* and is preferred for high-accuracy tuning.
- **Temperature dependence.** Winding resistance increases roughly 0.4%/°C with motor temperature. A motor at 80 °C has $R$ about 25% higher than at 20 °C, which directly affects voltage-mode kV behavior near saturation. Stator current limits help here by capping the heat-generating current.
- **CTRE updates these specs.** The values in this table reflect WCP/CTRE published data as of the document writing. For the absolute latest specs (especially after firmware updates that may slightly alter FOC behavior), check CTRE's [Motor Testing Lab](https://motors.ctr-electronics.com).


---

## 2. Voltage-Based Control

This section covers tuning each mechanism archetype using `VelocityVoltage`, `PositionVoltage`, `MotionMagicVoltage`, and `MotionMagicExpoVoltage`. All gains in this section are in **voltage units**.

The voltage family compensates for battery sag: when you ask for 8 V, the firmware measures the supply rail and modulates the H-bridge to actually deliver 8 V (until the battery can no longer supply it). What it does NOT compensate for is back-EMF — at high speed the motor opposes its own applied voltage, which is why kV has the units it does.

The underlying physical relationship for a brushless DC motor is:

$$
V_{\text{applied}} = R \cdot I + \omega \cdot k_e
$$

Where $R$ is winding resistance, $I$ is current, $\omega$ is rotor angular velocity, and $k_e$ is the back-EMF constant. Torque is proportional to current ($\tau = k_t \cdot I$), so:

$$
V_{\text{applied}} = \frac{R}{k_t} \cdot \tau + k_e \cdot \omega
$$

This is why voltage-mode kV represents the volts needed to overcome back-EMF at a given speed, and why voltage-mode performance degrades at the top of a mechanism's speed range — you have less voltage headroom available to produce torque.

### 2.1 Flywheel (Velocity)

A flywheel is a pure inertial load with viscous drag. Once at speed, only friction and bearing drag oppose motion, so steady-state holding torque is small. The interesting behaviors are spin-up and disturbance recovery (game piece entering the shooter).

#### 2.1.1 Control Output Equation

For `VelocityVoltage` (simple velocity PID, no profile):

$$
V(t) = k_S \cdot \mathrm{sgn}(v_{\text{ref}}) + k_V \cdot v_{\text{ref}} + k_P \cdot (v_{\text{ref}} - v_{\text{measured}}) + k_I \int (v_{\text{ref}} - v_{\text{measured}})\\,dt
$$

Note that **kD is intentionally omitted** — in velocity control, the D term acts on the derivative of velocity error (i.e., acceleration), which is mostly noise. Use kA via feedforward instead if you need acceleration response.

For `MotionMagicVelocityVoltage` (used when you want to limit how fast the velocity setpoint changes — uncommon for flywheels but useful when current-limit during spin-up is causing brownouts):

$$
V(t) = k_S \cdot \mathrm{sgn}(v_{\text{ref}}) + k_V \cdot v_{\text{ref}}(t) + k_A \cdot a_{\text{ref}}(t) + k_P \cdot (v_{\text{ref}}(t) - v_{\text{measured}})
$$

where $v_{\text{ref}}(t)$ now follows a trapezoidal ramp bounded by the configured acceleration.

#### 2.1.2 Parameter Effects

| Gain | Effect on Output |
|:---|:---|
| **kS** | Adds a constant offset to the commanded voltage to overcome stiction. Without it, low-RPS setpoints undershoot because static friction eats the small commanded voltage. |
| **kV** | Dominant feedforward. With correct kV, the steady-state error is near zero before any P term acts. Too low → setpoint undershoots. Too high → setpoint overshoots and the integrator/P term has to *subtract*, which is sluggish. |
| **kA** | Speeds up spin-up by anticipating the voltage needed to produce the desired acceleration. Only meaningful with profiled velocity or rapid setpoint changes. |
| **kP** | Pulls velocity error to zero. Higher kP → faster disturbance recovery, but also amplifies measurement noise (which is significant in velocity, since it's a numerical derivative of position). |
| **kI** | Eliminates steady-state offset from any unmodeled friction. Almost always unnecessary if kS and kV are correct. Watch for windup — Phoenix 6 has no native iZone, so consider gating the I term to errors below a threshold by switching slots or zeroing kI in software when far from setpoint. |

#### 2.1.3 Tuning Procedure

1. **Run SysId in voltage mode** to get kS, kV, kA. Typical SysId outputs land near the no-load values from [§1.6.3](#163-quick-reference-calculation-examples) plus 5–15% for friction: Kraken X60 flywheels around kV ≈ 0.12–0.14 V/(rotation/s) at the rotor; Kraken X44 around kV ≈ 0.10–0.11.
2. **Set kP = kI = 0.** Command a setpoint and verify steady-state RPS is correct. If the mechanism settles 5% low, your kV is 5% low — adjust before adding P.
3. **Add kP.** A reasonable starting point is calculated from the headroom you want for disturbance rejection. If you spin at 80 rps with kV = 0.12, your steady-state voltage is ~9.6 V, leaving ~2 V of headroom. If you want full headroom to engage at 20 rps of error:

$$
k_P \approx \frac{V_{\text{headroom}}}{e_{\text{trigger}}} = \frac{2.0}{20} = 0.10 \text{ V/(rps)}
$$

4. **Test with the actual game piece.** Inject the disturbance and watch the AdvantageScope velocity trace. Increase kP until recovery time is acceptable, back off if you see oscillation.
5. **Skip kI unless you genuinely have an integrating disturbance.** Very rare on flywheels.

#### 2.1.4 Pitfalls

- **No-load tuning.** A flywheel with no game piece behaves very differently from one being loaded. Always validate with realistic disturbances.
- **Configuring a sensor-to-mechanism ratio that includes the gear reduction**, then using rotor-RPS gains. Pick one convention and be consistent.
- **Velocity measurement noise.** Phoenix 6's default velocity filter is reasonable; if you're seeing 200 rps of jitter on a 80 rps setpoint, check your sensor source (CANcoder vs. integrated rotor) and the mechanical path (loose magnet, slipping coupler).

### 2.2 Turret (Position)

A turret is a rotating mass with no gravity coupling (rotation axis is vertical). The dominant physics are inertia and friction; there is no restoring force, which means the controller is the only thing that holds position.

#### 2.2.1 Control Output Equation

For `PositionVoltage` (simple position PID):

$$
V(t) = k_S \cdot \sigma_{\text{kS}} + k_P \cdot e_\theta + k_I \int e_\theta\\,dt + k_D \cdot \dot{e}_\theta
$$

where $e_\theta = \theta_{\text{ref}} - \theta_{\text{measured}}$ and $\sigma_{\text{kS}}$ is determined by the `StaticFeedforwardSign` config (see [§1.2.1](#121-the-staticfeedforwardsign-config)):

- With the default `UseVelocitySign`: $\sigma_{\text{kS}} = \mathrm{sgn}(\dot{\theta}_{\text{ref}})$, which is **zero** for a pure position request with no velocity argument — meaning kS contributes nothing. This is usually wrong for `PositionVoltage`.
- With `UseClosedLoopSign`: $\sigma_{\text{kS}} = \mathrm{sgn}(e_\theta)$, so kS is applied in the direction of error. **This is the correct setting for non-profiled position control on a turret.**

Note kV and kA are **not used** in `PositionVoltage` because there's no commanded velocity or acceleration trajectory — the setpoint is a step.

For `MotionMagicVoltage` or `MotionMagicExpoVoltage` (profiled position):

$$
V(t) = k_S \cdot \mathrm{sgn}(v_{\text{ref}}) + k_V \cdot v_{\text{ref}}(t) + k_A \cdot a_{\text{ref}}(t) + k_P \cdot e_\theta + k_I \int e_\theta\\,dt + k_D \cdot \dot{e}_\theta
$$

Now $v_{\text{ref}}$ and $a_{\text{ref}}$ come from the trajectory generator at each control cycle, so kV and kA do real work, and `StaticFeedforwardSign` should be left at its default `UseVelocitySign` so kS engages during motion and naturally goes to zero at the setpoint.

#### 2.2.2 Parameter Effects

| Gain | Effect on Output |
|:---|:---|
| **kS** | Provides the small voltage needed to start the turret moving against static friction. Especially noticeable on direct-drive or low-ratio turrets where stiction is a significant fraction of useful torque. The sign source depends on `StaticFeedforwardSign` — see [§1.2.1](#121-the-staticfeedforwardsign-config) and the per-mode notes above. |
| **kV** | (_Profiled only_) Produces the voltage to maintain commanded velocity along the profile. With correct kV, the controller follows the profile smoothly with low position error. |
| **kA** | (_Profiled only_) Anticipates the voltage to produce the commanded acceleration. Without it, the position error grows during the acceleration phase and shrinks during cruise, creating "lag". |
| **kP** | Pulls position to setpoint. Dominant term. |
| **kI** | Removes residual error from imperfect kS/kV. Often zero. |
| **kD** | Damps oscillation. Position has real second-order dynamics (mass + spring-like effect from kP), so D is genuinely useful here unlike in velocity control. Too much kD makes the system feel "sticky" and amplifies sensor noise. |

#### 2.2.3 Recommended Mode

**Use Motion Magic Expo for production.** A turret aiming at a moving target benefits enormously from a smooth, achievable trajectory. Simple `PositionVoltage` works for short corrections (e.g., aim refinement of <5°) but commands instantaneous infinite acceleration on big setpoint changes, which causes overshoot and current spikes.

#### 2.2.4 Tuning Procedure

1. **Configure soft limits** in `SoftwareLimitSwitchConfigs` before any tuning. A turret swinging into a hard mechanical stop at speed will damage gears.
2. **Set `StaticFeedforwardSign`** in your gain slot: leave at the default `UseVelocitySign` if you'll use Motion Magic, or set to `UseClosedLoopSign` if you'll use bare `PositionVoltage`.
3. **Run SysId in voltage mode** to get kS, kV, kA. For a turret driven by a single Kraken X60 at ~50:1, expect kV around 6–7 V/(rotation/s) at the mechanism (i.e., per output revolution per second). For a Kraken X44 at the same ratio, around 5–5.5 V/(rotation/s).
4. **Plug in kV, kA, kS. Set kP = kI = kD = 0.** Issue a slow `MotionMagicExpoVoltage` setpoint. The turret should track the profile loosely with feedforward alone.
5. **Add kP.** Aim for kP such that 5° of position error produces 1–2 V of correction. If your mechanism unit is rotations and 5° = 0.014 rotations, then $k_P \approx 1.5 / 0.014 \approx 100$ V/rotation. (These are mechanism units, not rotor units — sensor-to-mechanism ratio matters here.)
6. **Add kD** to taste. A starting heuristic is $k_D \approx k_P / 100$, then increase until overshoot is gone.
7. **Tune Motion Magic parameters last:**
   - Cruise velocity: as fast as the motor can sustain, accounting for back-EMF. For voltage mode, cruise velocity in rps × kV should leave at least 2–3 V of headroom. Example: kV = 6, target 9 V max usage → cruise ≈ 1.5 rps.
   - Acceleration: start with $a_{\max}$ such that $k_A \cdot a_{\max} + k_V \cdot v_{\max} \le 11$ V (with 1 V margin). Tune up from there based on observed tracking error.
   - For Expo: set `MotionMagicExpo_kV` ≈ kV from SysId, `MotionMagicExpo_kA` ≈ kA from SysId. Bias both slightly upward (1.1–1.2×) for safety per [§1.4.2](#142-tuning-motion-magic-expo-parameters). Setting `MotionMagicCruiseVelocity = 0` lets the profile run to its motor-limited maximum.

#### 2.2.5 Continuous Wrap

If the turret has a continuous-rotation range (no hard stops, e.g., via a slip ring), enable `ContinuousWrap` in `ClosedLoopGeneralConfigs`. This makes the controller take the shortest angular path to the setpoint, which is essential — without it, "go from 350° to 10°" tries to traverse 340° instead of 20°.

#### 2.2.6 Pitfalls

- **CANcoder phase mismatch.** Mounting the magnet upside down or configuring the wrong `SensorDirection` makes the system unstable with any nonzero kP. Verify by hand-rotating the turret and confirming the sensor count matches the rotation direction.
- **Tuning at the bench, deploying with a different inertia.** A turret with a shooter mounted on top has different kA than one without. Re-check feedforwards on the real assembly.

### 2.3 Arm (Position)

An arm rotates against gravity. The gravity torque on the joint depends on the cosine of the angle from horizontal, which means the holding voltage varies continuously through the range of motion. This is the key feature distinguishing arm tuning from turret tuning.

#### 2.3.1 Control Output Equation

For `PositionVoltage` with `GravityType = Arm_Cosine`:

$$
V(t) = k_S \cdot \sigma_{\text{kS}} + k_G \cos(\theta) + k_P \cdot e_\theta + k_I \int e_\theta\\,dt + k_D \cdot \dot{e}_\theta
$$

with $\sigma_{\text{kS}}$ controlled by `StaticFeedforwardSign` per [§1.2.1](#121-the-staticfeedforwardsign-config). For arms specifically, `UseClosedLoopSign` is the right choice for `PositionVoltage` because at the held setpoint, kG already supplies the gravity-holding voltage; kS is only needed to break stiction during small corrections, which is exactly what the closed-loop-sign source provides.

Phoenix 6 automatically computes $\cos(\theta)$ from the measured position, **provided that position 0 corresponds to the arm being horizontal.** This is a critical setup step — your encoder zero must be set so that horizontal = 0 rotations, otherwise the cosine is wrong everywhere.

For `MotionMagicExpoVoltage` (recommended):

$$
V(t) = k_S \cdot \mathrm{sgn}(v_{\text{ref}}) + k_G \cos(\theta) + k_V \cdot v_{\text{ref}}(t) + k_A \cdot a_{\text{ref}}(t) + k_P \cdot e_\theta + k_I \int e_\theta\\,dt + k_D \cdot \dot{e}_\theta
$$

The cosine term means that at $\theta = 0°$ (horizontal), gravity torque is maximum and $k_G \cos(0) = k_G$. At $\theta = 90°$ (straight up or down), $\cos(90°) = 0$ and no gravity feedforward is needed. This naturally interpolates through the range.

#### 2.3.2 Parameter Effects

| Gain | Effect on Output |
|:---|:---|
| **kG** | Constant offset scaled by $\cos(\theta)$ that holds the arm against gravity. With correct kG, the arm holds horizontal with zero PID effort. Too low → arm sags below setpoint when stationary. Too high → arm drifts above setpoint. Sign matters — if kG is the wrong sign, the arm runs away. |
| **kS** | Compensates for gearbox stiction. Often small (0.1–0.3 V) for well-greased mechanisms, larger for direct-drive arms or those with a brake. |
| **kV** | (_Profiled only_) Voltage per (rps) of commanded motion. |
| **kA** | (_Profiled only_) Voltage per (rps²) of commanded acceleration. Important for high-inertia arms (long arms with weights at the end). |
| **kP** | Position correction. Watch for over-tuning — a too-high kP combined with imperfect kG produces oscillation that's worst at the angle where kG mismatches most (often near horizontal). |
| **kD** | Damps oscillation. More important for arms than turrets because the gravity coupling adds a position-dependent restoring/destabilizing force. |
| **kI** | Useful here. Even with correct kG, the cosine model isn't perfect (the arm has finite stiffness, the CG isn't exactly where you measured). A small kI cleans up final position error. |

#### 2.3.3 Calculating kG from First Principles

Beyond just running SysId, you can sanity-check kG analytically. The derivation has three steps:

1. The gravity torque at the joint when the arm is horizontal:

$$
\tau_{\text{joint}} = m \cdot g \cdot L_{\text{cg}}
$$

2. The motor-shaft torque required, scaled by the gear ratio $G$ (where $G > 1$ is a reduction, so the motor sees less torque than the joint):

$$
\tau_{\text{motor}} = \frac{\tau_{\text{joint}}}{G} = \frac{m \cdot g \cdot L_{\text{cg}}}{G}
$$

3. The current to produce that torque ($I = \tau_{\text{motor}} / k_t$), then the voltage to drive that current through the windings at zero speed ($V = I \cdot R$):

$$
k_G = I \cdot R = \frac{\tau_{\text{motor}} \cdot R}{k_t} = \frac{m \cdot g \cdot L_{\text{cg}} \cdot R}{G \cdot k_t}
$$

Where $m$ is arm mass, $g = 9.81$ m/s², $L_{\text{cg}}$ is distance from pivot to center of gravity, $G$ is gear ratio (reduction), $k_t$ is motor torque constant (N·m/A), and $R$ is winding resistance. Pull $k_t$ and $R$ values from the table in [§1.6.2](#162-derived-electromechanical-constants).

**Worked example.** A 5 kg arm with CG at 0.4 m, gear ratio 100:1, on a Kraken X60 in voltage mode (FOC commutation, so $k_t = 0.0194$ N·m/A, $R = 0.0248$ Ω from [§1.6.2](#162-derived-electromechanical-constants)):

$$
k_G = \frac{5 \cdot 9.81 \cdot 0.4 \cdot 0.0248}{100 \cdot 0.0194} = \frac{0.4865}{1.94} \approx 0.25 \text{ V}
$$

That number is small because the gear ratio is large — at 100:1 the motor barely has to push to hold the arm. Cross-check: this is the same arm whose torque-mode holding current was 10.1 A in [§1.6.3](#163-quick-reference-calculation-examples), and indeed $V = I \cdot R = 10.1 \times 0.0248 = 0.25$ V at zero speed.

If SysId returns a kG dramatically different from this calculation, double-check your zero offset — a wrong reference angle will skew kG identification. The most common mode of failure is being off by a factor that corresponds to an angle error; e.g., a SysId kG twice the predicted value usually means your "zero" is at 60° from horizontal rather than at horizontal.

#### 2.3.4 Recommended Mode

**Motion Magic Expo Voltage.** Arms benefit even more than turrets from smooth profiling because the gravity coupling makes step responses unpredictable. A sudden step from 0° to 90° starts at maximum gravity torque and ends at zero — a simple `PositionVoltage` controller will see drastically different effective dynamics across the move.

#### 2.3.5 Tuning Procedure

1. **Set the zero correctly.** Use a level or a known-horizontal hardstop, then `setPosition(0)` (or use a CANcoder magnet offset). Confirm by manually moving to 90° and checking the reported position.
2. **Set `StaticFeedforwardSign`** based on your control mode (default `UseVelocitySign` for Motion Magic; `UseClosedLoopSign` for plain `PositionVoltage`).
3. **Run SysId in voltage mode with the Arm test.** This identifies kS, kV, kA, kG. If you can't run SysId, calculate kG from first principles and start from there.
4. **Plug in feedforwards, set PID = 0.** Power on at horizontal — the arm should hold. Move slowly through the range — should track loosely. If it sags more at one angle than another, your zero is off.
5. **Add kP.** Start small. For mechanism units of rotations and a typical FRC arm:

$$
k_P^{\text{start}} \approx \frac{0.5 \text{ V}}{0.014 \text{ rotations (5°)}} \approx 35 \text{ V/rotation}
$$

6. **Add kD.** Typical $k_D \approx k_P / 50$ to $k_P / 200$. Increase until overshoot is acceptable.
7. **Add small kI (~0.1–1.0 V/(rotation·s))** if final position drifts.
8. **Configure Motion Magic:**
   - For trapezoidal: cruise velocity that leaves voltage headroom at the worst gravity loading. If kG = 0.6 V and kV = 4 V/rps, max safe cruise (with 2 V margin) is $(12 - 0.6 - 2)/4 = 2.35$ rps.
   - For Expo: set `MotionMagicExpo_kV` ≈ kV from SysId, `MotionMagicExpo_kA` ≈ kA from SysId. Per [§1.4.2](#142-tuning-motion-magic-expo-parameters), bias slightly upward (1.1–1.2×). The profile self-limits to the arm's actual motor capability and accounts for changing back-EMF naturally.

#### 2.3.6 Pitfalls

- **GravityType not configured.** Without `GravityType = Arm_Cosine` in `MotorOutputConfigs`, kG is treated as a constant — the arm will be over-supported at vertical and under-supported at horizontal, or vice versa.
- **Single-stage vs. double-stage arms.** If the second stage rotates relative to the first, the gravity torque on the shoulder depends on the elbow angle too. A simple cosine model won't capture this; you need a software wrapper that computes the effective gravity feedforward and writes it to the slot's `Slot0Configs.kG` (or sends it via a separate `withFeedForward` argument on the request) every loop.
- **Asymmetric kS.** If the arm rises easily but falls slowly (or vice versa), gravity is biasing the friction. This means kS should differ between up-moves and down-moves; you can model this as kS + kG·cos(θ) only with a single-sign kS, but in practice most teams just pick a kS that's a compromise and add kI.
- **Continuous Wrap should be OFF.** Arms have finite range. Configure soft limits.

### 2.4 Elevator (Position)

An elevator is a translating mass against constant gravity. Unlike an arm, the gravity load doesn't change with position (assuming a single-stage cable rig — multi-stage cascades change effective mass per inch of motion, but the gravity torque on the motor remains constant per stage). The dynamics are linear, which makes elevators conceptually simpler than arms.

#### 2.4.1 Control Output Equation

For `PositionVoltage` with `GravityType = Elevator_Static`:

$$
V(t) = k_S \cdot \sigma_{\text{kS}} + k_G + k_P \cdot e_x + k_I \int e_x\\,dt + k_D \cdot \dot{e}_x
$$

with $\sigma_{\text{kS}}$ controlled by `StaticFeedforwardSign` per [§1.2.1](#121-the-staticfeedforwardsign-config). For `PositionVoltage` on an elevator, set the config to `UseClosedLoopSign` so kS assists breaking stiction during small height corrections; with the default `UseVelocitySign` and a step setpoint, kS would not engage at all.

Note that kG is a **constant** here, not multiplied by anything. The firmware just adds kG to the output unconditionally when `GravityType = Elevator_Static`. The sign of kG is the direction that opposes gravity (positive in most setups, where positive motor output extends the elevator upward).

For `MotionMagicExpoVoltage`:

$$
V(t) = k_S \cdot \mathrm{sgn}(v_{\text{ref}}) + k_G + k_V \cdot v_{\text{ref}}(t) + k_A \cdot a_{\text{ref}}(t) + k_P \cdot e_x + k_I \int e_x\\,dt + k_D \cdot \dot{e}_x
$$

#### 2.4.2 Parameter Effects

| Gain | Effect on Output |
|:---|:---|
| **kG** | Constant offset to hold against gravity. The motor must produce $k_G$ continuously while stationary at any height. Verify by stowing PID and confirming the elevator hovers (neither rises nor falls). |
| **kS** | Friction. Often larger on elevators than turrets due to bearing/guide friction along the rails. |
| **kV** | (_Profiled only_) Voltage per (rps). Convert to mechanism units if your sensor-to-mechanism ratio is set in m/rotation. |
| **kA** | (_Profiled only_) Critical for elevators because the inertia is real and concentrated. Without kA, the position lags during the acceleration phase of the profile. |
| **kP** | Position correction. Often the largest gain on a well-feedforwarded elevator because the mechanism is very stiff (rigid rails, low backlash). |
| **kD** | Damps oscillation. Useful but often less critical than on arms because there's no position-dependent destabilizing force. |
| **kI** | Sometimes useful for stickiness near the bottom of travel where guides may bind, but usually unnecessary. |

#### 2.4.3 Multi-Stage and Cascaded Elevators

For a cascaded elevator (where each stage moves at a multiple of the motor output), the effective kG depends on which stage is engaged. Most teams treat this as a single kG sized for the combined mass — the firmware doesn't natively support stage-aware feedforward. If the gravity load changes meaningfully between stages (e.g., a stage that holds a heavy intake vs. an empty stage), use a software wrapper that updates the active slot or supplies a `withFeedForward` term per loop.

For a continuously-cabled rig (Continuous-Cascade or Linear-Cascade), the effective output mass is constant and one kG suffices. **Confirm what kind of rig you have before tuning.**

#### 2.4.4 Recommended Mode

**Motion Magic Expo Voltage.** Elevators have a wide range of motion and benefit from a profile that respects motor authority. Simple `PositionVoltage` is acceptable for very short corrections (e.g., scoring height fine-tune) but is dangerous for full-travel moves due to current spikes at the start and end of the motion.

#### 2.4.5 Tuning Procedure

1. **Configure soft limits and a homing routine.** Elevators that drive into a hard stop at speed shred chains, snap cables, or bend frames. Use `ReverseSoftLimitSwitchEnable` and `ForwardSoftLimitSwitchEnable`.
2. **Set `StaticFeedforwardSign`** based on your control mode (default `UseVelocitySign` for Motion Magic; `UseClosedLoopSign` for plain `PositionVoltage`).
3. **Identify kG manually first.** With PID disabled, command a small voltage (start with 0.5 V) in the up direction. Increase until the elevator just holds steady at a midpoint. That voltage is your kG. Cross-check with SysId.
4. **Run SysId vertically.** Use the Elevator routine. This gives kS, kV, kA, kG simultaneously. Tip: if you don't have full travel for a clean SysId, you can split the test into shorter segments.
5. **Plug in feedforwards.** Verify the elevator holds at any height with PID = 0.
6. **Add kP.** Elevators tolerate fairly high kP because they're rigid. Start with $k_P \approx 1$ V per cm of error if your unit is meters, scaled appropriately. Increase until disturbance recovery is brisk.
7. **Add kD.** Often $k_D \approx k_P / 50$. Increase if you see overshoot at the top or bottom of moves.
8. **Configure Motion Magic Expo (per [§1.4.2](#142-tuning-motion-magic-expo-parameters)):** set `MotionMagicExpo_kV` ≈ kV from SysId and `MotionMagicExpo_kA` ≈ kA from SysId, biased slightly upward for safety. Set `MotionMagicCruiseVelocity = 0` to allow the profile to ride to its motor-limited maximum, or set a nonzero value if you want to clip top speed below that.

#### 2.4.6 Asymmetric Friction

Elevators often have noticeably different friction going up vs. down (gravity assists down-moves). Phoenix 6 doesn't directly support asymmetric kS within a single slot — `StaticFeedforwardSign` only chooses *how the sign is determined*, not *whether the magnitude varies by direction*. To handle truly asymmetric friction, you can:

- Use two slots (slot 0 for up, slot 1 for down) and switch via the `slot` argument on the request based on $\mathrm{sgn}(v_{\text{ref}})$. Each slot has its own kS (and its own `StaticFeedforwardSign` config) that you tune to match its direction.
- Or just pick a kS that's a compromise; the kI term will absorb the small asymmetry.

#### 2.4.7 Pitfalls

- **Wrong sign of kG.** If kG has the wrong sign, the motor pushes the elevator down when commanded to hold. Always test with a manual hold first.
- **kV drift over a season.** As cables stretch and bearings wear, friction creeps up. Re-run SysId once a month if possible, or after any major maintenance.
- **Falling through the bottom on enable.** If the robot powers up at the top of travel with PID disabled, the elevator falls. Always enable feedforward (kG) immediately on robot init, even before any setpoint is sent — or use a brake mode and trust it briefly.

### 2.5 Linear Deployment (Position)

A "linear deployment" is a short-stroke linear mechanism — typically an intake extension, a climber hook, or a pivoting deployment that's roughly linear over its range. The defining characteristics are:

- Short travel (often a few inches to a foot)
- Hard stops at both ends (or a hard stop + soft limit)
- Low or moderate inertia
- Gravity load may be present, absent, or angle-dependent

Tuning is essentially a constrained version of arm or elevator tuning, depending on the gravity geometry.

#### 2.5.1 Control Output Equation

If gravity is constant (deployment slides horizontally or vertically along a fixed axis):

$$
V(t) = k_S \cdot \sigma_{\text{kS}} + k_G + k_V \cdot v_{\text{ref}} + k_A \cdot a_{\text{ref}} + k_P \cdot e_x + k_D \cdot \dot{e}_x
$$

If gravity is angle-dependent (deployment pivots, e.g., a kicker arm that swings through a small range):

$$
V(t) = k_S \cdot \sigma_{\text{kS}} + k_G \cos(\theta) + k_V \cdot v_{\text{ref}} + k_A \cdot a_{\text{ref}} + k_P \cdot e_x + k_D \cdot \dot{e}_x
$$

Use `GravityType = Elevator_Static` for the first case, `Arm_Cosine` for the second. The $\sigma_{\text{kS}}$ term follows the rule from [§1.2.1](#121-the-staticfeedforwardsign-config): use `UseClosedLoopSign` if the deployment is driven by simple `PositionVoltage`, or `UseVelocitySign` (the default) if you're using Motion Magic.

#### 2.5.2 Recommended Mode

For very short moves (< 30° or < 4 inches), simple `PositionVoltage` is often fine and slightly faster to write than configuring Motion Magic. The travel is short enough that the start/end transients dominate the move time anyway.

For longer or repeated moves, **Motion Magic Expo Voltage** still wins — the smooth profile reduces wear on chain/cable and current spikes that can brown out the bus.

#### 2.5.3 Tuning Procedure (Abbreviated)

1. **Configure hard stops and soft limits.** Linear deployments often run into hard stops as part of normal operation (e.g., extending until the deployment hits its mechanical end). The hard stop is your zero — use the `ZeroPosition` or a homing-on-current-spike routine to set position at boot.
2. **Set `StaticFeedforwardSign`** based on your control mode. Short-stroke deployments are commonly driven by plain `PositionVoltage`, in which case use `UseClosedLoopSign`. If using Motion Magic, leave the default.
3. **Decide on gravity model.** Look at the geometry: does the deployment work against gravity through a meaningful range? If yes, configure GravityType and identify kG. If gravity is negligible (e.g., a horizontal slide on rollers), set kG = 0.
4. **Run a quick SysId** if travel allows. Often the travel is too short for clean SysId; in that case, manually identify:
   - kS by ramping voltage until motion starts.
   - kV by commanding a constant velocity and reading the steady-state voltage from `getMotorVoltage()`.
   - kA can usually be set to 0 for short, low-inertia deployments.
5. **Add kP** to correct position. Often quite high because these deployments are rigid and have small mechanism units.
6. **Add small kD** if overshoot is observed.
7. **Skip kI** unless the deployment has weird hysteresis.

#### 2.5.4 Homing and Zeroing

The single most common failure mode on linear deployments is loss of zero. A few options:

- **Hardstop homing on current spike.** On enable, drive slowly toward a known hardstop; when stator current exceeds a threshold (`StatorCurrentLimit` or polled via `getStatorCurrent()`), declare that position the zero. Cheap and effective.
- **Limit switch.** Use `ReverseLimitSwitch` configured in `HardwareLimitSwitchConfigs`. Phoenix 6 supports auto-zero-on-trigger via `AutoSetPositionEnable`.
- **Absolute encoder (CANcoder).** Most robust but most expensive. Eliminates homing entirely.

#### 2.5.5 Pitfalls

- **Trusting position across power cycles** without a homing routine. Talon FX integrated rotor position is only known relative to the boot state.
- **Tuning while the deployment is partially extended,** then deploying with a different reach. If the deployment carries a load that varies with position, kG should be modeled — possibly via the gravity feedforward type, or via a software-supplied `withFeedForward` term.
- **Soft limits that are too tight.** A soft limit with no margin from the hard stop will cause stalls when the closed-loop tries to drive past it during overshoot. Leave 0.5–1° of margin.

---

## 3. Torque-Current (FOC) Control

The torque-current family commands a target stator torque-producing current ($I_q$ in dq-frame terms) directly, using Field Oriented Control. This requires Phoenix Pro and a supported motor (Kraken X60 or Kraken X44).

### 3.0.1 Why Torque Control is Different

In a standard voltage-mode controller, the relationship between commanded voltage and produced torque depends on speed (because of back-EMF) and on supply voltage:

$$
\tau \propto I = \frac{V_{\text{applied}} - \omega \cdot k_e}{R}
$$

This means the same kP produces different actual force at low speed vs. high speed, and tuning that works at one battery state may not work at another. FOC commands the torque-producing current directly:

$$
\tau = k_t \cdot I_q
$$

where $I_q$ is the torque-producing component of stator current. The firmware closes a fast inner current loop at the device's PWM rate, decoupling the user-facing closed loop from electrical dynamics. From your perspective as the tuner, you're directly controlling motor torque.

### 3.0.2 Tuning Implications

Because the output is Amps, gain units change accordingly. A useful rule of thumb is:

$$
I = \frac{V}{R} \quad \Rightarrow \quad k_P^{\text{torque}} \approx \frac{k_P^{\text{voltage}}}{R}
$$

So if your voltage-mode kP was 30 V/rotation and your motor has $R = 0.0248$ Ω (Kraken X60 in FOC mode — see [§1.6.2](#162-derived-electromechanical-constants)), torque-mode kP starts around $30/0.0248 \approx 1210$ A/rotation. **In practice you don't actually want gains this aggressive** because the current limit will saturate and you lose linearity — which is exactly the point: the relationship between current and torque is constant, so tuning is more direct, but you must respect the current limit.

### 3.0.3 Feedforward in Torque Mode

**Which feedforwards apply depends on the control request, not just the mechanism.** A feedforward term only does work when the corresponding reference exists in the request. Specifically:

| Term | Active in `VelocityTorqueCurrentFOC` | Active in `PositionTorqueCurrentFOC` (no velocity arg) | Active in `MotionMagic*TorqueCurrentFOC` |
|:---|:---|:---|:---|
| kS | Yes | Yes (via `StaticFeedforwardSign` config — see [§1.2.1](#121-the-staticfeedforwardsign-config)) | Yes |
| kV | Yes — represents drag | No (no $v_{\text{ref}}$) | Yes |
| kA | Yes (if profiled or with explicit acceleration) | No (no $a_{\text{ref}}$) | Yes |
| kG | N/A | Yes | Yes |

This is a meaningful correction to the "calculate kA from inertia" advice you may see — **kA only contributes during profiled motion**. For non-profiled `PositionTorqueCurrentFOC`, calculating and setting kA does nothing because there is no commanded acceleration for it to multiply. Don't waste time tuning it for that mode; tune it when you switch to Motion Magic.

**Numerical values and meanings in torque mode:**

- **kS** is in Amps — the current needed to overcome stiction. Empirically tuned by ramping current until motion begins.
- **kV** for **flywheels** represents drag/windage and is genuinely useful — the CTRE flywheel example reaches kV ≈ 0.15 A/rps after tuning.
- **kV** for **position mechanisms** (turret, arm, elevator) is usually 0 in non-profiled mode and small but nonzero in profiled mode (representing geartrain viscous drag).
- **kA** is in Amps per (rotation/s²) and represents inertia: $k_A = J / k_t$ where $J$ is the inertia reflected to the rotor (i.e., $J_{\text{mech}} / G^2$ if mechanism units are mechanism-rps and the slot operates on mechanism units via SensorToMechanismRatio).
- **kG** is in Amps — the current to hold against gravity: $k_G = m g L_{\text{cg}} / (G \cdot k_t)$ for an arm at horizontal, or $k_G = m g r / (G \cdot k_t)$ for an elevator with drum radius $r$.

Phoenix 6's `MotionMagicTorqueCurrentFOC` and friends use the same kS/kV/kA/kG slot fields, just interpreted as Amps and Amps-per-unit.

#### Crucial physics: torque mode lacks natural damping

In voltage-mode control, the motor produces a back-EMF voltage that opposes its motion. This back-EMF acts as a natural velocity-proportional damping force — the motor inherently resists changes in speed, which means a moderately-tuned voltage-mode position controller can often work with only kP (no kD) without oscillating.

**This natural damping is gone in TorqueCurrentFOC.** The inner current loop holds the commanded torque regardless of motor speed, so there is no back-EMF resisting motion. As a result:

- **kD is essentially mandatory for torque-mode position control**, even for mechanisms that would have been stable on kP alone in voltage mode.
- Expect to tune kP and kD *together iteratively* rather than tuning kP first and adding kD only if needed.
- The ratio $k_D / k_P$ in torque mode is typically much higher than in voltage mode for the same mechanism — easily 1/30 or 1/20 rather than the 1/100 voltage-mode rule of thumb.

### 3.0.4 Why You Cannot Use SysId for Torque-Current Tuning

**Important:** WPILib's SysId tool is not usable for characterizing torque-current control modes. SysId's identification math assumes a first-order linear system of the form:

$$
V = k_S \cdot \mathrm{sgn}(\dot{x}) + k_V \cdot \dot{x} + k_A \cdot \ddot{x} \quad (+\\, k_G \text{ term for arms/elevators})
$$

This model is appropriate for voltage-mode control because voltage drives a coupled velocity/acceleration response through the back-EMF and resistance terms. In torque-current mode, the inner FOC loop has already closed the velocity-related electrical dynamics, so the system the user faces is essentially:

$$
\tau = J \cdot \ddot{x} + b \cdot \dot{x} + \tau_{\text{static}} + \tau_{\text{gravity}}
$$

where the kV-equivalent term represents only mechanical viscous friction (often near zero), not back-EMF. SysId's velocity-based identification will produce nonsensical kV values for this regime, and the kA estimate will be contaminated because the tool can't separate the electrical dynamics it expects from the mechanical-only response it actually sees.

**The correct approach is manual tuning from first principles.** Each torque-mode mechanism section below provides:

1. A first-principles calculation for kG (and kA for high-inertia systems) using motor data sheet values and mechanism geometry.
2. A measurement procedure for kS using a slow-ramp current command.
3. A procedure for setting kP and kD by direct observation of disturbance response.

This is more work than running SysId, but the calculations are tractable and the resulting gains are typically more accurate than SysId would produce anyway, because torque-mode physics maps very cleanly to motor data sheet values ($k_t$, mass, gear ratio, geometry).

Some teams also use a hybrid workflow: run SysId in voltage mode to get a sanity check on inertia (kA in voltage mode includes the $J/k_t$ term), then convert and apply that to torque mode. This is reasonable but requires careful unit conversion and is no faster than the first-principles approach for most mechanisms.

### 3.0.5 Profiled Tuning (Motion Magic with TorqueCurrentFOC)

When using Motion Magic in torque-current mode (`MotionMagicTorqueCurrentFOC`, `MotionMagicExpoTorqueCurrentFOC`, `MotionMagicVelocityTorqueCurrentFOC`), the profile generator produces $v_{\text{ref}}$ and $a_{\text{ref}}$ at every loop, which makes kV and kA do real work. The control output becomes:

$$
I_q(t) = k_S \cdot \mathrm{sgn}(v_{\text{ref}}) + k_G \cdot g(\theta) + k_V \cdot v_{\text{ref}}(t) + k_A \cdot a_{\text{ref}}(t) + k_P \cdot e + k_D \cdot \dot{e}
$$

A well-tuned profiled controller does most of its work via feedforward — kS handles stiction, kG handles gravity, kA produces the acceleration the profile demands, and kV produces the cruise velocity. The PID terms only correct residual error from imperfect modeling and disturbances. Per CTRE's guide:

> *"the introduction of a profile means much of the response can be calculated in advance with feed-forwards. This results in much of the work being done due to feed forward, with the feedback gains being used to account for any error in the system."*

#### Recommended order for tuning a profiled torque-current controller

This order matters. Tuning out of order causes terms to mask each other.

1. **Zero all gains.** Set kP = kI = kD = 0, kS = kV = kA = 0 (and kG = 0 unless gravity is present, in which case use the bracketing method first to get kG and kS, then proceed).

2. **Tune kS** by ramping current until motion begins (or, for arms, via the bracketing method in [§3.3.3](#333-tuning-procedure)). This is the same procedure as for non-profiled control.

3. **Tune kA at the acceleration phase.** Run a profiled move and observe the velocity slope at the start of the move (during the acceleration phase). Increase kA until the measured velocity slope matches the profiled velocity slope. If you have access to acceleration plots (Tuner X / AdvantageScope), match measured acceleration to commanded acceleration directly.
   - kA does the heavy lifting in profiled torque mode. The starting point from physics is $k_A = J_{\text{reflected}} / k_t$ where $J_{\text{reflected}}$ is the inertia reflected to the rotor; expect to land within ~30% of this value after empirical tuning.
   - CTRE's profiled example reaches kA = 65 A/(rotation/s²) for a 1:1 high-inertia mechanism.

4. **Tune kV at the cruise phase.** Once kA matches the acceleration ramps, look at the cruise phase (constant velocity). Increase kV until the measured velocity stays on top of the profiled velocity throughout cruise, with no gradual lag or lead.
   - Many position mechanisms have negligible drag and can use kV = 0. Don't add kV unless you can see drift during cruise.
   - CTRE's profiled example lands at kV = 0.15 A/(rotation/s) for the same mechanism — this is mostly drag, not back-EMF (which the inner FOC loop has eliminated).

5. **Tune kP and kD iteratively** as in non-profiled tuning — increase kP until oscillation, kD until oscillation stops, repeat until the limit is hit. With good feedforwards, the PID has much less work to do, so kP and kD often end up similar to or smaller than the non-profiled values for the same mechanism. Acceptable kP/kD in profiled mode often sit at the edge of stability that would be unusable in non-profiled mode, because the feedforward keeps the closed-loop error small enough that the PID rarely operates in its destabilizing regime.

**Worked example from CTRE.** A 1:1 high-inertia profiled mechanism tuned via this procedure landed at: kS = 1.25 A, kV = 0.15 A/(rotation/s), kA = 65 A/(rotation/s²), kP = 16000 A/rotation, kD = 2000 A/(rotation/s). The very high kP/kD values are possible only because kA is doing most of the work — without kA, the profile would not be tracked and the PID would operate well outside its stable regime.

### 3.1 Flywheel (Velocity)

Torque-current is genuinely excellent for flywheels because:

1. The inner current loop completely rejects back-EMF effects. Flywheel speed control becomes uniform across the speed range.
2. Disturbance recovery is much sharper because the controller commands torque directly rather than going through the back-EMF/voltage relationship.
3. Game-piece-induced velocity drops are corrected with bounded current spikes that won't cause brownouts (because you set the current limit explicitly).

#### 3.1.1 Control Output Equation

For `VelocityTorqueCurrentFOC`:

$$
I_q(t) = k_S \cdot \mathrm{sgn}(v_{\text{ref}}) + k_V \cdot v_{\text{ref}} + k_A \cdot a_{\text{ref}} + k_P \cdot (v_{\text{ref}} - v_{\text{measured}}) + k_I \int (v_{\text{ref}} - v_{\text{measured}})\\,dt
$$

The output is in Amps. Phoenix 6 then runs an inner current controller to actually produce that current at the windings.

#### 3.1.2 Parameter Effects

| Gain | Effect on Output (Torque Mode) |
|:---|:---|
| **kS** | Current to overcome stiction. Typically 1–4 A for FRC-scale flywheels. |
| **kV** | Current per (rps) to overcome viscous/windage drag. For a flywheel this is small but nonzero — air resistance grows with speed. |
| **kA** | Current per (rps²) of acceleration. $k_A = J / k_t$ where $J$ is reflected inertia. Lets the controller anticipate spin-up current. |
| **kP** | Disturbance rejection. Very effective in torque mode. Practical values are larger numerically than in voltage mode (because amps > volts for the same physical effect), and you can usually tune more aggressively before oscillation. |
| **kI** | Steady-state error correction. Often 0. |

#### 3.1.3 Tuning Procedure

CTRE's recommended approach (per their *Manually Tune your PID Loops* application note) iterates kS and kV between low and high setpoints until both converge. The key insight: kS dominates at low setpoints (where kV·v is small) and kV dominates at high setpoints (where kV·v is large), so tuning each at its dominant regime and iterating gives a clean separation. The procedure also prefers a small kP during kS/kV tuning rather than zero — a low kP makes setpoint convergence visible without masking feedforward errors.

1. **Configure current limits.** Set `StatorCurrentLimit` to your desired peak (e.g., 80 A for a single Kraken on a flywheel) and `SupplyCurrentLimit` to protect the bus (e.g., 60 A continuous, 80 A for 1 s).

2. **Set all gains to 0.** Including kP, kI, kD, kS, kV, kA.

3. **Tune kS at low setpoint.** With everything zero, set a low setpoint (around 1/10 of max velocity, e.g., 10 rps for a 100 rps flywheel). Increase kS until the flywheel just begins to spin and reaches the low setpoint without overshooting. Doubling-then-narrowing is fast: try 1, 2, 4, 8 Amps, then narrow once you bracket the right value.

4. **Set a small kP.** A reasonable starting point is `kP = 1 * RotorToSensorRatio * SensorToMechanismRatio` (i.e., 1 A/rps at the mechanism). The kP is intentionally small so it doesn't mask feedforward errors during kV tuning — it provides just enough closed-loop pull to make undershoot visible without dominating.

5. **Tune kV at high setpoint.** Set a high setpoint (around 8/10 of max velocity, e.g., 80 rps). Increase kV until the flywheel reaches the setpoint. If it overshoots significantly, halve kV; if it undershoots, increase. Narrowing the bracket gets you close.

6. **Iterate.** Return to the low setpoint — you'll likely overshoot now (kV adjustments shifted the balance). Reduce kS until the low setpoint is hit cleanly. Then return to the high setpoint and adjust kV again. Repeat until kS and kV both stabilize across two consecutive low-high cycles. Typically 2–3 iterations suffice; difficult mechanisms may need more.

7. **Increase kP for disturbance rejection.** With kS and kV settled, double kP repeatedly (1, 2, 4, 8, 16…) and observe the time-to-setpoint and overshoot. Stop when you see oscillation or unacceptable overshoot, then back off to the last good value. The CTRE flywheel example lands at kP = 10 A/rps for a representative system, but the right value depends entirely on your inertia and current limit.

8. **Test with the actual game piece (or simulated disturbance).** Watch the closed-loop error trace — if recovery is too slow, you have headroom for more kP; if oscillation appears, back off. If you're hitting the current limit during normal operation, the kP is producing more correction than the limit allows — back off.

9. **kA is only meaningful with profiled velocity (`MotionMagicVelocityTorqueCurrentFOC`).** If you use a profiled velocity request to control spin-up rate, calculate kA = $J_{\text{flywheel}} / (G \cdot k_t)$ as the starting point and refine empirically.

**Worked example from CTRE.** A 1:1 flywheel with 100 rps max velocity tuned via this procedure landed at: kS = 2.6 A, kV = 0.15 A/rps, kP = 10 A/rps. The kV here is dominated by aerodynamic drag, not motor effects, since the inner current loop has eliminated back-EMF concerns.

#### 3.1.4 Why This Is Better Than Voltage for Flywheels

A voltage-mode flywheel sees its disturbance-rejection authority shrink as it spins up — at 80 rps with kV=0.12, you've used 9.6 V of your 12 V budget for kV alone, leaving only 2.4 V for disturbance correction. A torque-mode flywheel sees no such issue: at any speed, the full current limit is available for correction. This gives noticeably faster recovery from disturbances on a high-speed shooter.

### 3.2 Turret (Position)

Turrets benefit from torque control mainly for **smoothness**: the torque-mode controller produces smoother low-speed motion and better small-correction tracking, because the inner current loop linearizes the back-EMF and friction nonlinearities.

#### 3.2.1 Control Output Equation

For `PositionTorqueCurrentFOC`:

$$
I_q(t) = k_S \cdot \sigma_{\text{kS}} + k_P \cdot e_\theta + k_I \int e_\theta\\,dt + k_D \cdot \dot{e}_\theta
$$

with $\sigma_{\text{kS}}$ controlled by `StaticFeedforwardSign` (see [§1.2.1](#121-the-staticfeedforwardsign-config)). For non-profiled position control on a turret, set this to `UseClosedLoopSign` so kS engages on small corrections; otherwise the velocity-sign default produces $\sigma_{\text{kS}} = 0$ and kS contributes nothing.

For `MotionMagicExpoTorqueCurrentFOC`:

$$
I_q(t) = k_S \cdot \mathrm{sgn}(v_{\text{ref}}) + k_V \cdot v_{\text{ref}}(t) + k_A \cdot a_{\text{ref}}(t) + k_P \cdot e_\theta + k_I \int e_\theta\\,dt + k_D \cdot \dot{e}_\theta
$$

#### 3.2.2 Parameter Effects

| Gain | Effect (Torque Mode) |
|:---|:---|
| **kS** | Current to overcome static friction. Direct-drive or low-ratio turrets need a larger kS than highly-geared ones. |
| **kV** | Current per (rps) — represents only viscous friction in the geartrain. Often very small (~0.5 A/rps or less). |
| **kA** | Current per (rps²) — proportional to reflected inertia. Significant for heavy turrets. |
| **kP** | Position correction. |
| **kD** | Damping. |

#### 3.2.3 Tuning Procedure

CTRE's recommended approach (per their *Manually Tune your PID Loops* application note) for non-profiled position control in TorqueCurrentFOC is: tune kS to overcome friction, then iterate kP and kD together to find the limit of the system. **kV and kA are not used in non-profiled position requests** — there is no commanded velocity or acceleration for them to multiply, so any nonzero values do nothing.

1. **Configure soft limits, current limits, and sensor.** Set `StatorCurrentLimit` to a reasonable peak (typical: 40–60 A for a turret).

2. **Set `StaticFeedforwardSign`** based on your control mode (`UseClosedLoopSign` for plain `PositionTorqueCurrentFOC`; default `UseVelocitySign` for Motion Magic).

3. **Zero all gains.**

4. **Set a small setpoint** (e.g., 0.1 mechanism rotations, ~36° for a 1:1 turret or ~1.8° for a 20:1 turret).

5. **Tune kS.** Increase kS until the turret just begins to move toward the setpoint. Back off slightly so it just barely doesn't move. The largest kS that still does not produce motion is the friction-overcoming current.

6. **Iterate kP and kD together.** This is the key insight from CTRE's guide: in TorqueCurrentFOC there is no natural back-EMF damping, so kP without kD will always overshoot or oscillate. The procedure:
   - Increase kP until you see significant overshoot. Doubling (1, 10, 50, 100, 200…) is efficient.
   - Increase kD until the overshoot stops. Again doubling works (1, 10, 20, 40…).
   - Repeat: increase kP further, then kD, until either (a) increasing kD produces *more* oscillation rather than less, or (b) the system oscillates *on its way to* the setpoint (not just at the setpoint).
   - When you hit (a) or (b), you've reached the system's latency limit. Reduce kD until any on-the-way oscillation stops, then reduce kP until any remaining overshoot stops.

7. **Verify at multiple setpoints.** Test setpoints at the small, medium, and large ends of your operating range. If the gains that work for small setpoints overshoot at larger ones (common — kP that's appropriate for small errors saturates the current limit on large errors and produces a step response), reduce kP until large setpoints behave well, accepting slightly slower small-setpoint response.

8. **Optional: gain scheduling.** If both small and large setpoints matter and a single set of gains compromises one, use slot 0 for one regime and slot 1 for the other, switching via the `slot` argument on the request based on $|e_\theta|$. CTRE's example tunes a turret to kP = 1650, kD = 60 for the small-setpoint case; large setpoints needed kP backed down to ~1700 with kD ≈ 60 to avoid overshoot.

9. **For profiled control (Motion Magic Expo), follow the Profiled Tuning procedure in [§3.0.5](#305-profiled-tuning-motion-magic-with-torquecurrentfoc)** — kS first, then kA (matched to acceleration phase), then kV (matched to cruise), then kP/kD iteratively as above.

**kP starting heuristic.** A simple starting point that scales with gear ratio is $k_P = 1 \cdot \text{RotorToSensorRatio} \cdot \text{SensorToMechanismRatio}$ A per mechanism-rotation of error (i.e., 1 A of output per rotor-rotation of error, scaled to mechanism units). For a 20:1 turret with all reduction in `SensorToMechanismRatio`, that's kP ≈ 20 A/rotation. CTRE's example turret tunes substantially higher (1650 A/rotation), reflecting that a well-tuned kP is much larger than this conservative starting point — but the heuristic gives you a safe non-zero starting value.

### 3.3 Arm (Position)

Arms in torque-current mode get a particularly clean kG calculation because gravity torque maps directly to motor torque maps directly to commanded current. The chain of conversions is shorter and less error-prone than in voltage mode.

#### 3.3.1 Control Output Equation

For `PositionTorqueCurrentFOC` with `GravityType = Arm_Cosine`:

$$
I_q(t) = k_S \cdot \sigma_{\text{kS}} + k_G \cos(\theta) + k_P \cdot e_\theta + k_I \int e_\theta\\,dt + k_D \cdot \dot{e}_\theta
$$

with $\sigma_{\text{kS}}$ controlled by `StaticFeedforwardSign` (see [§1.2.1](#121-the-staticfeedforwardsign-config)). Use `UseClosedLoopSign` for non-profiled position control: kG already supplies the bulk of the holding current at any angle, and kS only needs to engage on small corrections in whichever direction the error happens to be.

For `MotionMagicExpoTorqueCurrentFOC`:

$$
I_q(t) = k_S \cdot \mathrm{sgn}(v_{\text{ref}}) + k_G \cos(\theta) + k_V \cdot v_{\text{ref}} + k_A \cdot a_{\text{ref}} + k_P \cdot e_\theta + k_I \int e_\theta\\,dt + k_D \cdot \dot{e}_\theta
$$

#### 3.3.2 First-Principles kG in Torque Mode

The current required to hold an arm at horizontal is:

$$
I_{\text{hold}} = \frac{\tau_{\text{gravity}}}{G \cdot k_t} = \frac{m \cdot g \cdot L_{\text{cg}}}{G \cdot k_t}
$$

Example: 5 kg arm with CG at 0.4 m from pivot, gear ratio 100:1, Kraken X60 in FOC mode ($k_t = 0.0194$ N·m/A from [§1.6.2](#162-derived-electromechanical-constants)):

$$
I_{\text{hold}} = \frac{5 \cdot 9.81 \cdot 0.4}{100 \cdot 0.0194} = 10.1 \text{ A}
$$

So kG ≈ 10 A. The same arm on a Kraken X44 (FOC, $k_t = 0.0154$) would need ~12.7 A. This is a nice property of torque mode: the calculation is unit-clean and falls directly out of mechanism geometry plus the motor table.

#### 3.3.3 Tuning Procedure

CTRE's recommended approach uses a **bracketing method** to find kG and kS simultaneously, exploiting the fact that gravity and friction interact predictably at the angle of maximum gravity torque (horizontal):

1. **Set zero correctly** (horizontal = 0). Same as voltage mode.
2. **Set `StaticFeedforwardSign`** (`UseClosedLoopSign` for plain `PositionTorqueCurrentFOC`, default for Motion Magic).
3. **Zero all PID gains.** Set kP = kI = kD = 0. Also zero kS, kV, kA.

4. **Find the lower kG bound (`kG_low`).** Position the arm at horizontal. With all gains zero, increase kG until the smallest value at which the arm just barely holds — i.e., does not fall. The current at this threshold is $kG - kS$, since friction is helping resist gravity here.
   - Doubling-then-narrowing finds it fast: try 1, 2, 4, 8, 16 Amps until it holds, then narrow.

5. **Find the upper kG bound (`kG_high`).** From there, continue increasing kG until the largest value at which the arm still does not move *upward*. Above this, the motor force exceeds gravity + friction and starts driving the arm up. The current at this threshold is $kG + kS$.

6. **Compute kG and kS from the brackets:**

$$
k_G = \frac{kG_{\text{high}} + kG_{\text{low}}}{2}, \qquad k_S = \frac{kG_{\text{high}} - kG_{\text{low}}}{2}
$$

   This separates the gravity component (the midpoint of the bracket) from the friction component (half the bracket width), which is more accurate than computing each in isolation. Cross-check kG against the first-principles value from [§3.3.2](#332-first-principles-kg-in-torque-mode) — they should agree within 10–15%.

7. **Set a small setpoint** (typically 0.1 mechanism rotations from current position).

8. **Iterate kP and kD together** as described for the turret in [§3.2.3](#323-tuning-procedure) — increase kP until significant overshoot, increase kD until overshoot stops, repeat until either kD increases produce *more* oscillation, or oscillation appears on the way to setpoint. When the limit is hit, back off kD until on-the-way oscillation stops, then back off kP until any remaining overshoot stops.

9. **Verify at multiple setpoints,** especially across the gravity-loaded range. A setpoint that swings the arm from near-vertical to near-horizontal experiences gravity torque that triples during the move, which can expose kP gains that work for small moves but overshoot on long ones. CTRE's example arm starts with kP = 3700, kD = 300 for small moves, but reduces kP to 1700 for setpoints requiring large angular travel.

10. **For Motion Magic profiled control, follow the Profiled Tuning procedure in [§3.0.5](#305-profiled-tuning-motion-magic-with-torquecurrentfoc).** kA and kV become relevant only when there's a commanded velocity/acceleration trajectory.

**Worked example from CTRE.** A 35:1 arm tuned via this procedure landed at: kG = 21 A, kS = 3.5 A (from brackets at 17.5 A and 24.5 A), kP = 3700 A/rotation, kD = 300 A/(rotation/s). For larger setpoints requiring a wider operating range, kP was reduced to 1700.

#### 3.3.4 Compound Arms (Multi-Joint)

If the arm is a 2-DOF system (shoulder + elbow), the gravity torque on the shoulder depends on the elbow angle:

$$
\tau_{\text{shoulder, gravity}} = m_1 g L_1 \cos(\theta_1) + m_2 g (L_1 \cos(\theta_1) + L_2 \cos(\theta_1 + \theta_2))
$$

Phoenix 6's built-in `Arm_Cosine` only handles the single-cosine case. For 2-DOF, compute the gravity feedforward in software and pass it via the request's `FeedForward` parameter (in Amps for torque mode), with kG set to 0 in the slot:

```java
private final MotionMagicExpoTorqueCurrentFOC control = new MotionMagicExpoTorqueCurrentFOC(0);
...
double gravityFF = computeShoulderGravityCurrent(shoulderAngle, elbowAngle);
shoulderMotor.setControl(control.withPosition(targetAngle).withFeedForward(gravityFF));
```

This is one of the cases where torque mode genuinely shines — you can compute torque from physics, and that torque maps directly to a current command.

### 3.4 Elevator (Position)

Elevators in torque mode are very clean because the dynamics are linear and the gravity term is a pure constant.

#### 3.4.1 Control Output Equation

For `MotionMagicExpoTorqueCurrentFOC` with `GravityType = Elevator_Static`:

$$
I_q(t) = k_S \cdot \mathrm{sgn}(v_{\text{ref}}) + k_G + k_V \cdot v_{\text{ref}} + k_A \cdot a_{\text{ref}} + k_P \cdot e_x + k_I \int e_x\\,dt + k_D \cdot \dot{e}_x
$$

#### 3.4.2 First-Principles Gains

For an elevator with output mass $m$, drum radius $r$, and gear ratio $G$:

$$
k_G = \frac{m \cdot g \cdot r}{G \cdot k_t}, \qquad k_A = \frac{m \cdot r}{G \cdot k_t} \quad \text{(in A per rotor-rps²; multiply by appropriate factor if mechanism units differ)}
$$

These first-principles values are what you tune from. Validate them with the manual measurement procedure below.

#### 3.4.3 Why Torque Mode Is Especially Good for Elevators

1. **Predictable acceleration.** $a = (I - I_{\text{gravity}}) / (m r / (G k_t))$. Commanding a current produces a known acceleration regardless of speed.
2. **Brownout-aware.** With explicit current limits, you can size for the worst-case acceleration phase and trust the controller will never exceed it. In voltage mode, a hard step setpoint can transiently demand more current than the bus can supply.
3. **Symmetric down-moves.** Voltage-mode elevators see different kV behavior on up vs. down because back-EMF is signed. Torque-mode sees identical dynamics in both directions.

#### 3.4.4 Tuning Procedure

1. **Configure soft limits, current limits, and homing.** Same as voltage-mode elevator — this is non-negotiable.
2. **Set `StaticFeedforwardSign`** (`UseClosedLoopSign` for plain `PositionTorqueCurrentFOC`, default for Motion Magic).
3. **Zero all gains.**
4. **Find kG via the bracketing method.** Like the arm procedure ([§3.3.3](#333-tuning-procedure)), but with the gravity direction always pointing the same way (down), so:
   - Increase kG until the smallest value at which the elevator stops falling. That value is $kG - kS$.
   - Continue increasing kG until the largest value at which the elevator does *not* start rising. That value is $kG + kS$.
   - kG is the midpoint; kS is half the bracket width.
   - Cross-check kG against the first-principles value from [§3.4.2](#342-first-principles-gains) — they should agree within 10–15%.
5. **Set a small setpoint** (e.g., 0.1 mechanism rotations from current position).
6. **Iterate kP and kD together** as in [§3.2.3](#323-tuning-procedure) — increase kP until significant overshoot, increase kD until overshoot stops, repeat until the limit is hit. Elevators tolerate fairly aggressive kP because they're rigid; expect to land at higher kP than a comparably-sized arm.
7. **Verify at multiple setpoints,** including up-moves and down-moves at full travel. Asymmetric friction (gravity-assisted vs. gravity-opposed) often shows up here as different overshoot behavior in the two directions; if it's significant, use slot 0 for up-moves and slot 1 for down-moves.
8. **For Motion Magic profiled control, follow the Profiled Tuning procedure in [§3.0.5](#305-profiled-tuning-motion-magic-with-torquecurrentfoc)** to add kV and kA. The elevator's $k_A$ from physics is a useful starting point for the profile slot:

$$
k_A = \frac{m \cdot r}{G \cdot k_t} \quad \text{(in A per rotor-rps²; convert to mechanism units as appropriate)}
$$

### 3.5 Linear Deployment (Position)

Most short-stroke linear deployments don't need torque mode — voltage mode is simpler to set up and the precision benefits of FOC don't matter for moves where the start/end transients dominate. **But** there's one important exception: any deployment where you want **force control** rather than position control.

#### 3.5.1 Force-Limited Deployment

A common use case is a climber or hook that needs to extend until it contacts the chain/bar, then apply a controlled force. With torque-current control, you can:

1. Drive to a position with `PositionTorqueCurrentFOC` and a tight current limit.
2. Once at position, switch to `TorqueCurrentFOC` (the open-loop torque mode) with a desired holding current.

The control output for `TorqueCurrentFOC` (open-loop) is just:

$$
I_q(t) = I_{\text{commanded}}
$$

This is a pure current command — no PID, no feedforward, just "produce this much torque." It's perfect for "pull with this much force" applications. A holding current of, say, 30 A produces a known motor torque, which produces a known force on the cable/hook regardless of position.

#### 3.5.2 Hybrid Position+Force Control

```java
if (deploymentExtended && readyToApplyForce) {
  motor.setControl(new TorqueCurrentFOC(holdingAmps));
} else {
  motor.setControl(new MotionMagicExpoTorqueCurrentFOC(targetPosition));
}
```

The state machine switches between position-following (during extension) and pure force-applying (during hold). This is essentially impossible to do cleanly with voltage-mode control because the force produced by a given voltage depends on speed.

#### 3.5.3 Tuning Procedure

For position phase, follow the standard torque-mode tuning workflow: calculate kG, kA from first principles; measure kS empirically; tune kP and kD by observation. (See [§3.4.4](#344-tuning-procedure) if there's a gravity component, or [§3.2.3](#323-tuning-procedure) if the deployment slides horizontally.)

For force phase, no tuning is needed — the current command directly maps to torque/force. You just need to:

1. Compute the current corresponding to your desired force: $I = F \cdot r / (G \cdot k_t)$ where $r$ is drum radius (or appropriate moment arm).
2. Stay within the continuous current rating of the motor for sustained holds (Kraken X60 ≈ 40 A continuous).
3. Use `StatorCurrentLimit` set above your hold current as a safety cap.


---

## 4. Voltage vs. Torque: Selection Guide

This section consolidates the decision criteria for picking a control family per mechanism. The summary recommendation precedes the detailed reasoning.

### 4.1 Quick Recommendations

**Assuming Phoenix Pro is available**, FOC torque-current control is the default for most mechanisms because it produces more consistent behavior across battery states, decouples the user-facing control loop from back-EMF dynamics, and gives explicit control over current. The table below states the FOC recommendation as the default and identifies cases where voltage mode is still a reasonable or even preferred choice.

| Mechanism | Recommended Default | Voltage is Acceptable / Preferred When... |
|:---|:---|:---|
| Flywheel | FOC (`VelocityTorqueCurrentFOC`) | Low-speed rollers (intakes, indexers) where back-EMF nonlinearity is irrelevant; or when SysId convenience outweighs the marginal performance gain. |
| Turret | FOC (`MotionMagicExpoTorqueCurrentFOC`) | Coarse turrets that just point to N preset angles; or when WPILib's `ArmFeedforward` integration matters (note: turrets don't use it, but the team's tooling may be voltage-centric). |
| Arm | FOC (`MotionMagicExpoTorqueCurrentFOC`) | Simple single-DOF arms where SysId-driven voltage tuning is "good enough" and the team's institutional knowledge is voltage-mode. The `ArmFeedforward` class drops in cleanly here. |
| Elevator | FOC (`MotionMagicExpoTorqueCurrentFOC`) | Low-inertia, low-stakes elevators (e.g., a small wrist mechanism) where the mechanism is rigid, fast to settle, and voltage mode tunes quickly with SysId. |
| Linear Deployment | FOC (`MotionMagicExpoTorqueCurrentFOC` for position; `TorqueCurrentFOC` for force-hold) | Position-only deployments with short stroke (< 4 inches or < 30°) where the start/end transients dominate move time anyway. Force-control deployments (climbers, hooks) should always use FOC. |
| Drive base swerve | FOC for steer (`PositionTorqueCurrentFOC`); FOC or voltage for drive | Voltage mode for drive is widely used and battle-tested. FOC for drive enables current-based traction control but adds tuning complexity. |

**The dispositive question for each mechanism:** does this mechanism benefit from torque-direct control, or is voltage "good enough"? Use FOC when any of the following apply: (a) the mechanism operates at high speeds where back-EMF eats voltage headroom, (b) you care about force/torque as a primary control objective, (c) brownout protection requires explicit current limits, (d) you need consistent behavior across battery states, or (e) the mechanism has high inertia and you want predictable acceleration. Use voltage when SysId-driven tuning, WPILib feedforward classes, or team institutional knowledge make it the lower-friction option for an already-acceptable result.

### 4.2 Detailed Selection Criteria

#### Pick Torque-Current FOC When (the default with Phoenix Pro):

- **You have Phoenix Pro and a Kraken X60 or X44.** FOC is the more capable tool; absent specific reasons to choose voltage, default to FOC.
- **Performance varies meaningfully with battery state.** Voltage mode compensates for supply sag at the H-bridge but not at the rotor (because back-EMF is unaffected by what you do with V_supply). FOC closes the loop on the actual electromagnetic interaction.
- **You care about force or torque output as a primary control objective.** Climbers, force-controlled grippers, traction-controlled drives — these are torque-mode use cases by nature.
- **You need predictable acceleration regardless of speed.** Trapezoidal profiles in voltage mode see acceleration phase work differently at different speeds; in FOC, acceleration is just $I/J$ and is uniform.
- **You want "soft" current limiting to substitute for clutch slipping.** With `TorqueCurrentFOC`, exceeding the current limit just clips your torque; it doesn't blow up the controller. This is genuinely safer for mechanisms that occasionally jam (intakes, climbers grabbing chains).
- **Multi-motor mechanisms where you want all motors to produce equal torque.** Voltage-mode "follower" mode produces equal voltages, which produces unequal currents if the motors have any matching difference. FOC followers in current-match mode (`Follower` with appropriate config) produce equal torques.
- **High-speed mechanisms where back-EMF eats voltage headroom.** A flywheel at 80 rps with kV = 0.12 has used 9.6 V of its 12 V budget for kV alone, leaving only 2.4 V for disturbance correction. FOC retains full current authority at any speed.

#### Pick Voltage When (situational alternatives):

- **You don't have Phoenix Pro.** This is the dispositive constraint for many teams. Voltage control on Phoenix 6 is genuinely good — most championship-level performance is achievable in voltage mode.
- **The mechanism is simple, well-understood, and SysId works.** For a basic single-DOF arm, a hood, or a wrist, voltage mode + SysId + WPILib's feedforward classes is a battle-tested workflow that tunes quickly and gives perfectly acceptable results. FOC's marginal gains may not be worth the manual characterization effort.
- **WPILib feedforward classes drop in cleanly and you want to use them.** `SimpleMotorFeedforward`, `ArmFeedforward`, `ElevatorFeedforward` all produce volts. Their outputs go directly into voltage-mode slot gains. There is no equivalent off-the-shelf class for torque-current, so going FOC means computing feedforwards from physics yourself.
- **Tuning intuition matters more than peak performance.** Voltage units are how most FRC teams think about motor effort ("the arm needs about 4 V to hold horizontal"). This makes voltage mode easier to debug, hand off between students, and reason about during competition troubleshooting.
- **The mechanism rarely operates near its top speed.** If you're not hitting back-EMF saturation, the back-EMF nonlinearity that FOC fixes isn't a problem you have.
- **Your current draw is far from any limit.** If you're not bumping current limits, the explicit current control of FOC isn't buying you anything.
- **The mechanism is short-stroke and start/end transients dominate.** A 4-inch climber deployment finishes its move so quickly that the precision benefits of FOC during cruise are invisible — the move is mostly accelerating and decelerating.

#### Don't Bother Switching an Already-Tuned Mechanism When:

- **The mechanism already works well in voltage mode.** Don't fix what isn't broken. Switching forces a re-tune.
- **You're under time pressure.** Tuning torque mode requires manual characterization (SysId is voltage-mode only), re-deriving gains in current units, and validating disturbance behavior. Mid-season is not the time.
- **The team's institutional knowledge is voltage-mode.** Mentor and student understanding of "what kV does" is in Volts. Switching everything to Amps imposes a learning cost that may exceed the performance benefit.

### 4.3 Mixed-Mode Strategies

You don't have to pick one family per robot — you can pick per mechanism. With Phoenix Pro available, a typical mixed-mode robot might look like:

- **Drive base translation:** voltage or FOC. Voltage is widely deployed and works well; FOC enables current-based traction control at the cost of a more complex tune.
- **Drive base steering (swerve):** FOC. The fast, repeated small-angle corrections benefit from FOC's smoothness and its current-limit-as-stall-protection behavior.
- **Shooter flywheels:** FOC. Clear win — back-EMF rejection at high speed is the killer feature.
- **Turret:** FOC for vision-aimed continuous tracking; voltage if it's a "point at one of N preset positions" mechanism.
- **Arm:** FOC for primary scoring arms; voltage acceptable for simple wrists or hoods.
- **Elevator:** FOC for the main lift; voltage acceptable for low-stakes secondary stages.
- **Climber:** FOC mandatory for the hook-pulling phase (force control). The position phase can be either, but staying in FOC simplifies the state machine.
- **Intakes / indexers:** FOC if you care about not stalling on game pieces; voltage if it's just "spin until full." The current-limit-as-clutch behavior is genuinely useful here.

Different mechanisms have different requirements, and Phoenix 6 supports any combination. The only constraint is that within a single closed-loop request, you commit to one family.

### 4.4 Common Migration Pitfalls

If you're moving an existing mechanism from voltage to torque-current:

1. **All gains must be re-derived.** kP, kI, kD, kS, kV, kA, kG all change units. SysId is not usable for torque-current characterization; you must compute kG and kA from first principles (motor $k_t$, gear ratio, mass, geometry) and measure kS empirically with a slow current ramp. Plan for several hours of recharacterization per mechanism.
2. **Current limits become load-bearing.** In voltage mode, the bus voltage was your effective limit. In FOC, you must explicitly configure `StatorCurrentLimit` and `SupplyCurrentLimit`. Without these, FOC will happily destroy the motor in a stall.
3. **Motion Magic Expo configs are always in Volts** — even in torque-current mode. `MotionMagicExpo_kV` and `MotionMagicExpo_kA` use volts regardless of the closed-loop output family, unlike the slot kV/kA which change units between voltage and torque modes. There are no separate FOC variants of these configs. See [§1.4.1](#141-motion-magic-expo-in-detail).
4. **WPILib feedforward classes don't directly apply.** `ArmFeedforward`, `ElevatorFeedforward`, and `SimpleMotorFeedforward` all produce volts, not amps. For torque-mode mechanisms, you'll compute current feedforwards yourself from physics (see the formulas in each Section 3 subsection). There is no off-the-shelf `ArmCurrentFeedforward` class as of this writing, and SysId cannot characterize torque-current systems either.
5. **Logging / diagnostics change.** Plot `StatorCurrent` and `ClosedLoopReference` instead of `MotorVoltage` and `ClosedLoopError`. Your debugging instincts need to update.

---

*This document covers the steady-state state of Phoenix 6 control modes as of 2024–2025. Always cross-check with the current CTRE documentation and Phoenix 6 API reference, since specific parameter names and config field locations occasionally evolve between API versions.*

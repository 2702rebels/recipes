# 💎 Best Practices and Patterns for FRC 🤖

A collection of recipes capturing best practices and typical patterns. Not all practices are universal as some may only be relevant to 2702 use cases, but many are generic enough to benefit everyone.

---

## Software

Common themes that apply to robot software development.

### Less-is-more

Do not overcomplicate your code unnecessarily, start simple, increase complexity through constant iterations based on the feedback from the field testing.

Use components provided by base (WPILIB) and vendor libraries. Write custom code when no appropriate solution exists.

Know when to "draw the line" aka "no premature optimization" — once an adequate solution is achieved move onto other problems, optimize later if time permits.

### Steal from the best, invent the rest

Do not blindly copy-paste from other's team code. It is likely to have bugs or work in unexpected way. Use it for inspiration, but make sure you fully understand what and why it does.

Write your own version after studying other's code, this tests your understanding and helps escaping pitfalls.

### Control modes

Team standardized on CTRE ecosystem using [Phoenix 6](https://v6.docs.ctr-electronics.com/en/stable/) with Pro licensed devices. Recommended default is to use torque-based (FOC enabled) control modes. Consult [CTRE Control Modes Tuning for FRC](ctre-control-modes.md) for a comprehensive overview.

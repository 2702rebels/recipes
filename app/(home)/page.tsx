import { BookOpen, Camera, Gauge, GraduationCap } from "lucide-react";
import Link from "next/link";

import type { ReactNode } from "react";

const SECTIONS: { title: string; href: string; description: string; icon: ReactNode }[] = [
  {
    title: "Software Practices",
    href: "/docs/practices/software",
    description: "How we approach robot software: keep it simple, learn from others, standardize.",
    icon: <BookOpen className="size-5" />,
  },
  {
    title: "CTRE Control Modes",
    href: "/docs/guides/ctre",
    description: "Closed-loop tuning for every common mechanism, in Volts and Amps, with interactive explorers.",
    icon: <Gauge className="size-5" />,
  },
  {
    title: "Vision",
    href: "/docs/vision",
    description: "How a robot finds itself on the field with a camera: AprilTags, PnP solving, and calibration.",
    icon: <Camera className="size-5" />,
  },
  {
    title: "Training",
    href: "/docs/training",
    description: "Guided material for new members. Work in progress.",
    icon: <GraduationCap className="size-5" />,
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-6 py-16">
      <section className="flex flex-col items-start gap-5">
        <span className="rounded-full border border-fd-border px-3 py-1 text-xs text-fd-muted-foreground">
          FRC Team 2702 · Rebels
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Recipes for FRC</h1>
        <p className="max-w-2xl text-lg text-fd-muted-foreground">
          Best practices, tuning guides, and training material from Team 2702. Written for our own members, shared for
          everyone.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/docs"
            className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground">
            Start reading
          </Link>
          <Link
            href="/docs/guides/ctre/procedures"
            className="rounded-lg border border-fd-border px-4 py-2 text-sm font-medium hover:bg-fd-accent">
            Tune a mechanism
          </Link>
          <Link
            href="/docs/guides/ctre/motion-magic-expo"
            className="rounded-lg border border-fd-border px-4 py-2 text-sm font-medium hover:bg-fd-accent">
            Try the Expo explorer
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex flex-col gap-2 rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:bg-fd-accent">
            <span className="text-fd-primary">{s.icon}</span>
            <span className="font-semibold">{s.title}</span>
            <span className="text-sm text-fd-muted-foreground">{s.description}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}

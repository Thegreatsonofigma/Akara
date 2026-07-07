import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { GradientBackground } from "@/components/ui/GradientBackground";

export default function NotFound() {
  return (
    <div className="relative overflow-hidden">
      <GradientBackground />
      <Container className="relative flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
        <p className="font-numbers text-7xl tracking-wider text-brand">404</p>
        <h1 className="mt-4 text-2xl font-bold text-white sm:text-3xl">
          This page does not exist.
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
          The link may be outdated or mistyped. Everything Akara offers starts
          from the homepage.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-black transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(157,255,30,0.35)]"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to home
        </Link>
      </Container>
    </div>
  );
}

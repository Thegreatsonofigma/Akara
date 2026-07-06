import { Hero } from "@/components/home/Hero";
import { StatsStrip } from "@/components/home/StatsStrip";
import { Problem } from "@/components/home/Problem";
import { Solution } from "@/components/home/Solution";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Currencies } from "@/components/home/Currencies";
import { Verification } from "@/components/home/Verification";
import { NameMatch } from "@/components/home/NameMatch";
import { ReceiptsDisputes } from "@/components/home/ReceiptsDisputes";
import { SafetyControls } from "@/components/home/SafetyControls";
import { DesignedFor } from "@/components/home/DesignedFor";
import { Compliance } from "@/components/home/Compliance";
import { FAQ } from "@/components/home/FAQ";
import { FinalCTA } from "@/components/home/FinalCTA";

export default function HomePage() {
  return (
    <>
      <Hero />
      <StatsStrip />
      <Problem />
      <Solution />
      <HowItWorks />
      <Currencies />
      <Verification />
      <NameMatch />
      <ReceiptsDisputes />
      <SafetyControls />
      <DesignedFor />
      <Compliance />
      <FAQ />
      <FinalCTA />
    </>
  );
}

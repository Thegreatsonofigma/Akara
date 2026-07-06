import { Hero } from "@/components/home/Hero";
import { TickerBand } from "@/components/home/TickerBand";
import { Problem } from "@/components/home/Problem";
import { Solution } from "@/components/home/Solution";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Currencies } from "@/components/home/Currencies";
import { PhotoBand } from "@/components/home/PhotoBand";
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
      <TickerBand />
      <Problem />
      <HowItWorks />
      <Solution />
      <Currencies />
      <PhotoBand />
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
